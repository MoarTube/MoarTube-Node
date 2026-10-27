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
