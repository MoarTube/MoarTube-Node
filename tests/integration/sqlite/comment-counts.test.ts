import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { openTestDatabase, video } from './helpers.js';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { CommentsService } from '@/services/comments.js';
import { provisionSQLiteComments } from '@/database/provisioning/comments.js';
import { Logger } from '@/utils/logger.js';

describe('atomic comment counts (sqlite)', () => {
  let database: ReturnType<typeof openTestDatabase>;
  let comments: ReturnType<typeof createCommentsRepository>,
    videos: ReturnType<typeof createVideosRepository>,
    service: CommentsService;
  beforeEach(async () => {
    database = openTestDatabase();
    comments = createCommentsRepository('sqlite', database.db);
    videos = createVideosRepository('sqlite', database.db);
    service = new CommentsService(Logger.getInstance(), comments);
    await videos.create(video('a'));
    await videos.create(video('b'));
  });
  afterEach(() => database?.close());
  it('maintains counts with repository inserts, moves, updates, and deletes', async () => {
    const row = await comments.create({
      video_id: 'a',
      timestamp: 1,
      comment_plain_text_sanitized: 'hello',
    });
    expect((await videos.findById('a'))?.comments).toBe(1);
    await comments.update(row.comment_id, { comment_plain_text_sanitized: 'edited' });
    expect((await videos.findById('a'))?.comments).toBe(1);
    await comments.update(row.comment_id, { video_id: 'b' });
    expect((await videos.findById('a'))?.comments).toBe(0);
    expect((await videos.findById('b'))?.comments).toBe(1);
    await comments.delete('b', row.comment_id, 1);
    expect((await videos.findById('b'))?.comments).toBe(0);
  });
  it('decrements once when two deletion requests race', async () => {
    const row = await service.createComment({ videoId: 'a', commentPlainText: 'reply' });
    const results = await Promise.all([
      service.deleteComment('a', row.comment_id, row.timestamp),
      service.deleteComment('a', row.comment_id, row.timestamp),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await comments.countByVideoId('a')).toBe(0);
    expect((await videos.findById('a'))?.comments).toBe(0);
  });
  it('keeps concurrent insert counts equal to actual rows', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        service.createComment({ videoId: 'a', commentPlainText: 'concurrent' })
      )
    );
    expect(await comments.countByVideoId('a')).toBe(20);
    expect((await videos.findById('a'))?.comments).toBe(20);
  });
  it('repairs old counters once while preserving comments and rolling back failed mutations', async () => {
    await service.createComment({ videoId: 'a', commentPlainText: 'preserved' });
    const before = database.client.prepare('SELECT * FROM comments ORDER BY comment_id').all();
    const epoch = await comments.getCacheEpoch();
    database.client.exec('UPDATE videos SET comments=-4; DROP TRIGGER comment_cache_delete');
    provisionSQLiteComments(database.client);
    expect((await videos.findById('a'))?.comments).toBe(1);
    expect((await videos.findById('b'))?.comments).toBe(0);
    expect(database.client.prepare('SELECT * FROM comments ORDER BY comment_id').all()).toEqual(
      before
    );
    const repaired = await comments.getCacheEpoch();
    expect(repaired).not.toBe(epoch);
    provisionSQLiteComments(database.client);
    expect(await comments.getCacheEpoch()).toBe(repaired);
    expect(() =>
      database.client.transaction(() => {
        database.client.exec('DELETE FROM comments');
        throw new Error('rollback');
      })()
    ).toThrow('rollback');
    expect((await videos.findById('a'))?.comments).toBe(1);
    expect(await comments.countByVideoId('a')).toBe(1);
  });
});
