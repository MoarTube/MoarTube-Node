import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVideosRepository } from '@database/repositories/videos/index.js';
import { videos } from '@database/schemas/sqlite/index.js';
import { getTableColumns } from 'drizzle-orm';
import { openTestDatabase, video } from './helpers.js';

describe('SQLite videos (real SQL)', () => {
  let database: ReturnType<typeof openTestDatabase>;
  let repository: ReturnType<typeof createVideosRepository>;
  beforeEach(() => {
    database = openTestDatabase();
    repository = createVideosRepository('sqlite', database.db);
  });
  afterEach(() => database?.close());

  it('matches the standalone schema exactly after fresh migrations', () => {
    const columns = database.client.prepare('PRAGMA table_info(videos)').all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name).sort()).toEqual(
      Object.keys(getTableColumns(videos)).sort()
    );
    expect(columns).toHaveLength(35);
    for (const column of ['is_indexing', 'is_indexed', 'is_index_outdated']) {
      expect(getTableColumns(videos)).not.toHaveProperty(column);
    }
  });

  it('persists defaults, nullable fields, booleans, JSON text, and generated IDs', async () => {
    const row = await repository.create(video('a'));
    expect(row).toMatchObject({
      id: expect.any(Number),
      views: 0,
      is_published: false,
      is_comments_enabled: true,
      source_file_extension: null,
      length_timestamp: null,
      outputs: '{}',
      meta: '{}',
    });
    expect(await repository.findById('a')).toEqual(row);
    expect(await repository.findByDbId(row.id)).toEqual(row);
    expect(await repository.findById('missing')).toBeNull();
    expect(await repository.findByDbId(-1)).toBeNull();
    const changes = {
      is_published: true,
      source_file_extension: 'mp4',
      outputs: JSON.stringify({ '1080p': '✓' }),
    };
    expect(await repository.update('a', changes)).toMatchObject(changes);
    expect(await repository.findById('a')).toMatchObject(changes);
    expect(await repository.update('missing', changes)).toBeNull();
    expect(await repository.delete('a')).toBe(true);
    expect(await repository.delete('a')).toBe(false);
  });

  it('executes SQL counters', async () => {
    await repository.createMany([video('a'), { ...video('b') }]);
    await repository.incrementViews('a');
    await repository.incrementViewsBy('a', 4);
    await repository.incrementViewsBy('b', 2);
    await repository.incrementLikes('a');
    await repository.incrementDislikes('a');
    await repository.incrementComments('a');
    await repository.incrementComments('a');
    await repository.decrementComments('a');
    await repository.updateBandwidth('a', 123456789);
    expect(await repository.findById('a')).toMatchObject({
      views: 5,
      likes: 1,
      dislikes: 1,
      comments: 1,
      bandwidth: 123456789,
    });
    expect(await repository.findById('b')).toMatchObject({ views: 2 });
  });

  it('adds bandwidth deltas atomically across batches and videos',async()=>{
    await repository.createMany([video('a'),video('b')]);
    await repository.updateBandwidth('a',1000);
    await Promise.all([repository.updateBandwidth('a',500),repository.updateBandwidth('b',2000),repository.updateBandwidth('a',250)]);
    expect((await repository.findById('a'))?.bandwidth).toBe(1750);
    expect((await repository.findById('b'))?.bandwidth).toBe(2000);
  });

  it('filters publication/streaming/finalization, timestamp boundaries, text, and tags', async () => {
    expect(await repository.getCount()).toBe(0);
    expect(await repository.getCount({ isPublished: true })).toBe(0);
    expect(await repository.createMany([])).toEqual([]);
    const rows = await repository.createMany([
      {
        ...video('a', 100),
        title: 'Alpha',
        views: 20,
        likes: 1,
        is_published: true,
        is_finalized: true,
      },
      {
        ...video('b', 200),
        title: 'Beta',
        views: 10,
        likes: 3,
        is_published: true,
        is_streaming: true,
      },
      { ...video('c', 300), title: 'Gamma', tags: 'sports', views: 30, likes: 2 },
      {
        ...video('d', 400),
        title: 'Delta',
        is_published: true,
      },
    ]);
    expect(await repository.findAll()).toEqual([rows[3], rows[2], rows[1], rows[0]]);
    expect(await repository.findAll({})).toHaveLength(4);
    expect(await repository.findAll({ search: '', tagTerm: '' })).toHaveLength(4);
    expect(await repository.findAll({ sortDirection: 'asc', sortBy: 'title', limit: 2 })).toEqual([
      rows[0],
      rows[1],
    ]);
    expect(await repository.findAll({ sortBy: 'views', limit: 1 })).toEqual([rows[2]]);
    expect(await repository.findAll({ sortBy: 'likes', limit: 1 })).toEqual([rows[1]]);
    expect(await repository.findAll({ sortBy: 'creation_timestamp' })).toHaveLength(4);
    expect(
      await repository.findAll({
        isPublished: true,
        isStreaming: false,
        isFinalized: true,
        search: 'Alpha',
        tagTerm: 'music',
        timestamp: 200,
      })
    ).toEqual([rows[0]]);
    expect(await repository.getCount({ isPublished: true })).toBe(3);
    expect(await repository.getCount({ isPublished: false })).toBe(1);
    expect(await repository.getCount({})).toBe(4);
    expect(await repository.findAll({ search: 'Description' })).toHaveLength(4);
    expect(await repository.findAll({ search: 'sports' })).toEqual([rows[2]]);
    expect(await repository.findAll({ timestamp: 200 })).toEqual([rows[0]]);
    expect(await repository.findAll({ search: "' OR 1=1 --" })).toEqual([]);
    expect(await repository.findPublished()).toEqual([rows[3], rows[1], rows[0]]);
    expect(
      await repository.findPublished({ sortDirection: 'asc', sortBy: 'title', limit: 1 })
    ).toEqual([rows[0]]);
    expect(await repository.findStreaming()).toEqual([rows[1]]);
    expect(await repository.deleteAll()).toBe(4);
    expect(await repository.deleteAll()).toBe(0);
  });

  it('rejects NOT NULL violations and rolls back a failed bulk insert atomically', async () => {
    await expect(repository.create({ ...video('bad'), title: null! })).rejects.toThrow();
    await expect(
      repository.createMany([video('valid'), { ...video('bad'), title: null! }])
    ).rejects.toThrow();
    expect(await repository.getCount()).toBe(0);
    expect(() =>
      database.db.transaction((tx) => {
        tx.insert(videos).values(video('rollback')).run();
        throw new Error('rollback');
      })
    ).toThrow('rollback');
    expect(await repository.findById('rollback')).toBeNull();
    database.client.exec(
      'CREATE TRIGGER ignore_video BEFORE INSERT ON videos BEGIN SELECT RAISE(IGNORE); END'
    );
    await expect(repository.create(video('ignored'))).rejects.toThrow(
      'Failed to create video record'
    );
  });
  it('projects tags and paginates visible catalog rows', async () => {
    await repository.createMany(
      Array.from({ length: 202 }, (_, i) => ({
        ...video('paged-' + i, i),
        tags: i === 200 ? 'private' : i === 201 ? 'live' : 'common,, ',
        is_published: i < 200,
        is_live: i === 201,
      }))
    );
    expect(await repository.findTags()).toEqual(['common', 'live', 'private']);
    expect(await repository.findTags(true)).toEqual(['common', 'live']);
    expect(await repository.findAll({ visibleOnly: true, limit: 10, offset: 200 })).toHaveLength(1);
  });
});
