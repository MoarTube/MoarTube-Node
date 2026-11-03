import { CommentsRepositorySQLite } from '@/database/repositories/comments/sqlite.js';
import { describe, expect, it } from 'vitest';
import { VideosRepositorySQLite } from '@/database/repositories/videos/sqlite.js';
import { openTestDatabase, video } from '../../integration/sqlite/helpers.js';
describe('bounded catalog queries against SQLite', () => {
  it('paginates tied timestamps without duplicates and keeps live unpublished videos discoverable', async () => {
    const fixture = openTestDatabase();
    try {
      const repository = new VideosRepositorySQLite(fixture.db);
      for (let i = 0; i < 12; i++)
        await repository.create({
          ...video(`video-${i}`, 100),
          is_published: i < 10,
          is_live: i === 10,
        });
      const first = await repository.findAll({ visibleOnly: true, limit: 6, offset: 0 });
      const second = await repository.findAll({ visibleOnly: true, limit: 6, offset: 6 });
      expect(first).toHaveLength(6);
      expect(second).toHaveLength(5);
      expect(new Set([...first, ...second].map((row) => row.video_id)).size).toBe(11);
      expect([...first, ...second].some((row) => row.video_id === 'video-10')).toBe(true);
      expect(await repository.findTags(true)).toEqual(['live', 'music']);
    } finally {
      fixture.close();
    }
  });
});
describe('catalog tag discovery', () => {
  it('filters before paging tags and matches entire tags before paging videos', async () => {
    const fixture = openTestDatabase();
    try {
      const repository = new VideosRepositorySQLite(fixture.db);
      for (let i = 0; i < 10; i++) {
        await repository.create({
          ...video('match-' + i, i),
          title: 'matching title',
          tags: ' tag' + i + ' , music ',
          is_published: true,
          views: i,
        });
      }
      await repository.create({
        ...video('substring', 100),
        title: 'matching title',
        tags: 'music-video',
        is_published: true,
      });
      await repository.create({
        ...video('hidden', 200),
        title: 'matching title',
        tags: 'private',
      });
      await repository.create({
        ...video('unrelated', 300),
        title: 'unrelated',
        tags: 'other',
        is_published: true,
      });
      const options = {
        visibleOnly: true,
        search: 'matching',
        tagTerm: 'music',
        limit: 4,
        offset: 0,
        sortBy: 'creation_timestamp' as const,
      };
      const first = await repository.findAll(options);
      const second = await repository.findAll({ ...options, offset: 4 });
      expect(first.map((row) => row.video_id)).toEqual([
        'match-9',
        'match-8',
        'match-7',
        'match-6',
      ]);
      expect(second.map((row) => row.video_id)).toEqual([
        'match-5',
        'match-4',
        'match-3',
        'match-2',
      ]);
      expect(await repository.getCount(options)).toBe(10);
      const tags = await repository.findTags(true, { search: 'matching', limit: 8, offset: 0 });
      const rest = await repository.findTags(true, { search: 'matching', limit: 8, offset: 8 });
      expect(tags).toHaveLength(8);
      expect(rest).toHaveLength(4);
      expect(new Set([...tags, ...rest]).size).toBe(12);
      expect([...tags, ...rest]).not.toContain('private');
      expect([...tags, ...rest]).not.toContain('other');
      expect(
        await repository.findTags(true, {
          search: 'matching',
          sortBy: 'creation_timestamp',
          limit: 3,
        })
      ).toEqual(['music-video', 'music', 'tag9']);
      expect(
        await repository.findTags(true, {
          search: 'matching',
          sortBy: 'creation_timestamp',
          sortDirection: 'asc',
          limit: 3,
        })
      ).toEqual(['music', 'tag0', 'tag1']);
      expect(
        await repository.findTags(true, { search: 'matching', sortBy: 'views', limit: 2 })
      ).toEqual(['music', 'tag9']);
      expect(await repository.findTags(true, { search: 'absent', limit: 8 })).toEqual([]);
    } finally {
      fixture.close();
    }
  });
});

describe('comment history pages', () => {
  it('keeps comments with tied timestamps accessible on separate pages', async () => {
    const fixture = openTestDatabase();
    try {
      const repository = new CommentsRepositorySQLite(fixture.db);
      for (let i = 0; i < 150; i++)
        await repository.create({
          video_id: 'video',
          timestamp: 100,
          comment_plain_text_sanitized: 'comment ' + i,
        });
      const first = await repository.findByVideoId('video', { limit: 100, offset: 0 });
      const second = await repository.findByVideoId('video', { limit: 100, offset: 100 });
      expect(first).toHaveLength(100);
      expect(second).toHaveLength(50);
      expect(new Set([...first, ...second].map((row) => row.comment_id)).size).toBe(150);
    } finally {
      fixture.close();
    }
  });
});

describe('comment refresh cursor', () => {
  it('does not skip a burst of comments sharing the same timestamp', async () => {
    const fixture = openTestDatabase();
    try {
      const repository = new CommentsRepositorySQLite(fixture.db);
      for (let i = 0; i < 150; i++)
        await repository.create({
          video_id: 'video',
          timestamp: 100,
          comment_plain_text_sanitized: 'comment ' + i,
        });
      const first = await repository.findByVideoIdWithTimestampFilter(
        'video',
        'after',
        'ascending',
        0,
        0
      );
      const last = first[99]!;
      const second = await repository.findByVideoIdWithTimestampFilter(
        'video',
        'after',
        'ascending',
        last.timestamp,
        last.comment_id
      );
      expect(first).toHaveLength(101);
      expect(second).toHaveLength(50);
    } finally {
      fixture.close();
    }
  });
  it('loads older tied-timestamp comments without skipping or duplicating rows after inserts', async () => {
    const fixture = openTestDatabase();
    try {
      const repository = new CommentsRepositorySQLite(fixture.db);
      for (let i = 0; i < 205; i++)
        await repository.create({
          video_id: 'history',
          timestamp: 100,
          comment_plain_text_sanitized: String(i),
        });
      const initial = (await repository.findByVideoId('history')).slice(0, 100);
      await repository.create({
        video_id: 'history',
        timestamp: 101,
        comment_plain_text_sanitized: 'new',
      });
      const cursor = initial.at(-1)!;
      const older = await repository.findByVideoIdWithTimestampFilter(
        'history',
        'before',
        'descending',
        cursor.timestamp,
        cursor.comment_id
      );
      expect(older).toHaveLength(101);
      expect(older[0]!.comment_id).toBeLessThan(cursor.comment_id);
      const tail = older[99]!;
      const last = await repository.findByVideoIdWithTimestampFilter(
        'history',
        'before',
        'descending',
        tail.timestamp,
        tail.comment_id
      );
      expect(last).toHaveLength(5);
      expect(
        new Set([...initial, ...older.slice(0, 100), ...last].map((c) => c.comment_id)).size
      ).toBe(205);
    } finally {
      fixture.close();
    }
  });
});
