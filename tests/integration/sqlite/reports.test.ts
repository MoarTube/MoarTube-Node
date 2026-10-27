import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReportsVideosRepository } from '@database/repositories/reports-videos/index.js';
import { createReportsCommentsRepository } from '@database/repositories/reports-comments/index.js';
import { createReportsArchiveVideosRepository } from '@database/repositories/reports-archive-videos/index.js';
import { createReportsArchiveCommentsRepository } from '@database/repositories/reports-archive-comments/index.js';
import { openTestDatabase, report } from './helpers.js';

const cases = [
  {
    name: 'video reports',
    factory: createReportsVideosRepository,
    key: 'report_id',
    table: 'videoreports',
  },
  {
    name: 'comment reports',
    factory: createReportsCommentsRepository,
    key: 'report_id',
    table: 'commentreports',
  },
  {
    name: 'archived video reports',
    factory: createReportsArchiveVideosRepository,
    key: 'archive_id',
    table: 'videoreportsarchives',
  },
  {
    name: 'archived comment reports',
    factory: createReportsArchiveCommentsRepository,
    key: 'archive_id',
    table: 'commentreportsarchives',
  },
] as const;

describe.each(cases)('SQLite $name (real SQL)', ({ factory, key, table }) => {
  let database: ReturnType<typeof openTestDatabase>;
  beforeEach(() => {
    database = openTestDatabase();
  });
  afterEach(() => database?.close());

  it('round trips records and executes ordered, limited, and scoped queries', async () => {
    const repository = factory('sqlite', database.db);
    expect(await repository.getCount()).toBe(0);
    if ('countNewerThan' in repository) {
      expect(await repository.countNewerThan(0)).toBe(0);
    }
    expect(await repository.findById(-1)).toBeNull();
    expect(await repository.createMany([])).toEqual([]);
    const first = await repository.create(report('a', 100));
    const rows = await repository.createMany([
      report('a', 200),
      { ...report('b', 300), comment_id: 2 },
    ]);
    const id = key === 'archive_id' && 'archive_id' in first ? first.archive_id : first.report_id;
    if (typeof id !== 'number') throw new Error('Missing generated primary key');
    expect(id).toBeGreaterThan(0);
    expect(await repository.findById(id)).toEqual(first);
    expect(await repository.findAll()).toEqual([rows[1], rows[0], first]);
    expect(await repository.findAll({})).toHaveLength(3);
    expect(await repository.findAll({ limit: 1 })).toEqual([rows[1]]);
    expect(await repository.findAll({ limit: 1, offset: 1, search: 'Report' })).toEqual([rows[0]]);
    expect(await repository.findAll({ search: 'Report 100' })).toEqual([first]);
    expect(await repository.findByVideoId('a')).toEqual([rows[0], first]);
    expect(await repository.findByVideoId('a', { limit: 1 })).toEqual([rows[0]]);
    expect(await repository.findByVideoId('missing')).toEqual([]);
    expect(await repository.getCount()).toBe(3);
    if ('findByCommentId' in repository) {
      expect(await repository.findByCommentId(1)).toEqual([rows[0], first]);
      expect(await repository.findByCommentId(1, { limit: 1 })).toEqual([rows[0]]);
      expect(await repository.deleteByCommentId(2)).toBe(1);
    }
    if ('findByReportId' in repository) {
      expect(await repository.findByReportId(100)).toEqual(first);
      expect(await repository.findByReportId(-1)).toBeNull();
    }
    if ('countNewerThan' in repository) {
      expect(await repository.countNewerThan(200)).toBe('findByCommentId' in repository ? 0 : 1);
    }
    expect(await repository.delete(id)).toBe(true);
    expect(await repository.delete(id)).toBe(false);
    expect(await repository.deleteByVideoId('a')).toBe(1);
    const remaining = await repository.getCount();
    expect(await repository.deleteAll()).toBe(remaining);
    expect(await repository.deleteAll()).toBe(0);
  });

  it('enforces constraints and detects an insert suppressed by a real SQLite trigger', async () => {
    const repository = factory('sqlite', database.db);
    await expect(repository.create({ ...report(), email: null! })).rejects.toThrow();
    database.client.exec(
      `CREATE TRIGGER ignore_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`
    );
    await expect(repository.create(report())).rejects.toThrow('Failed to create');
    expect(await repository.getCount()).toBe(0);
  });
});
