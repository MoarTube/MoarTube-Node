import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCommentsRepository } from '@database/repositories/comments/index.js';
import { CommentsService } from '@/services/comments.js';
import { comment, openTestDatabase } from './helpers.js';

describe('PostgreSQL comments (real SQL)', () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>>;
  let repository: ReturnType<typeof createCommentsRepository>;

  beforeEach(async () => {
    database = await openTestDatabase();
    repository = createCommentsRepository('postgres', database.db);
  });
  afterEach(() => database?.close());

  it('batches authoritative backlinks and synchronizes insert, edit, and deletion metadata', async () => {
    const first = await repository.create(comment('a', 100));
    const start = await repository.getCacheVersion('a');
    const reply = await repository.create({
      ...comment('a', 200),
      comment_plain_text_sanitized: `&gt;&gt;00${first.comment_id} &gt;&gt;${first.comment_id}`,
    });
    await repository.create({
      ...comment('b', 300),
      comment_plain_text_sanitized: `&gt;&gt;${first.comment_id}`,
    });
    expect(await repository.getBacklinksForComments('a', [first.comment_id])).toEqual([
      { parent_id: first.comment_id, reply_id: reply.comment_id },
    ]);
    const changes = await repository.getCacheChanges('a', start);
    expect(changes.map((row) => row.comment_id)).toEqual(
      expect.arrayContaining([first.comment_id, reply.comment_id])
    );
    const version = await repository.getCacheVersion('a');
    await repository.update(reply.comment_id, { comment_plain_text_sanitized: 'No reference' });
    expect(await repository.getBacklinksForComments('a', [first.comment_id])).toEqual([]);
    expect((await repository.getCacheChanges('a', version)).map((row) => row.comment_id)).toContain(
      first.comment_id
    );
    const beforeDelete = await repository.getCacheVersion('a');
    await repository.delete('a', reply.comment_id, 200);
    expect(await repository.getCacheChanges('a', beforeDelete)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ comment_id: reply.comment_id, deleted: 1 }),
      ])
    );
    expect(await repository.getBacklinksForComments('a', [])).toEqual([]);
  });

  it('does not resurrect a deleted parent when a child reference changes', async () => {
    const parent = await repository.create(comment('a', 100));
    const child = await repository.create({
      ...comment('a', 200),
      comment_plain_text_sanitized: `&gt;&gt;${parent.comment_id}`,
    });
    const since = await repository.getCacheVersion('a');
    await repository.delete('a', parent.comment_id, 100);
    await repository.update(child.comment_id, {
      comment_plain_text_sanitized: `&gt;&gt;${parent.comment_id} again`,
    });
    expect(await repository.getCacheChanges('a', since)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ comment_id: parent.comment_id, deleted: 1 }),
      ])
    );
    expect(await repository.findByIds('a', [])).toEqual([]);
    expect(await repository.findByIds('a', [child.comment_id])).toEqual([
      expect.objectContaining({ comment_id: child.comment_id }),
    ]);
  });

  it('round trips generated IDs, Unicode, updates, and composite lookups/deletes', async () => {
    const row = await repository.create(comment());
    expect(row.comment_id).toBeGreaterThan(0);
    expect(await repository.findById('a', row.comment_id, 100)).toEqual(row);
    expect(await repository.findById('b', row.comment_id, 100)).toBeNull();
    expect(await repository.findById('a', row.comment_id, 101)).toBeNull();
    expect(await repository.findByVideoIdAndTimestamp('a', 100)).toEqual(row);
    expect(await repository.findByVideoIdAndTimestamp('a', 101)).toBeNull();
    expect(
      await repository.update(row.comment_id, { comment_plain_text_sanitized: 'Updated' })
    ).toMatchObject({ comment_plain_text_sanitized: 'Updated' });
    expect(await repository.update(-1, { timestamp: 1 })).toBeNull();
    expect(await repository.delete('b', row.comment_id, 100)).toBe(false);
    expect(await repository.delete('a', row.comment_id, 101)).toBe(false);
    expect(await repository.delete('a', row.comment_id, 100)).toBe(true);
    expect(await repository.delete('a', row.comment_id, 100)).toBe(false);
  });

  it('filters strict timestamp boundaries, sorts, searches, counts, and bulk deletes', async () => {
    expect(await repository.countAll()).toBe(0);
    expect(await repository.countByVideoId('missing')).toBe(0);
    expect(await repository.countNewerThan(0)).toBe(0);
    expect(await repository.createMany([])).toEqual([]);
    const rows = await repository.createMany([
      comment('a', 100),
      comment('a', 200),
      comment('a', 300),
      comment('b', 150),
    ]);
    expect(await repository.findAll()).toHaveLength(4);
    expect(await repository.findByVideoId('a')).toEqual([rows[2], rows[1], rows[0]]);
    expect(
      await repository.findByVideoIdWithTimestampFilter('a', 'before', 'ascending', 300)
    ).toEqual([rows[0], rows[1]]);
    expect(
      await repository.findByVideoIdWithTimestampFilter('a', 'after', 'descending', 100)
    ).toEqual([rows[2], rows[1]]);
    expect(await repository.countByVideoId('a')).toBe(3);
    expect(await repository.countByVideoId('missing')).toBe(0);
    expect(await repository.countNewerThan(200)).toBe(1);
    expect(await repository.search(2, 'ascending', 300)).toEqual([rows[0], rows[3]]);
    expect(await repository.search(5, 'descending', 300, 'a', 'Comment')).toEqual([
      rows[1],
      rows[0],
    ]);
    expect(await repository.search(5, 'ascending', 400, undefined, "' OR 1=1 --")).toEqual([]);
    expect(await repository.deleteByVideoId('a')).toBe(3);
    expect(await repository.countAll()).toBe(1);
    expect(await repository.deleteAll()).toBe(1);
    expect(await repository.deleteAll()).toBe(0);
  });

  it('detects an insert suppressed by a real PostgreSQL trigger', async () => {
    await database.ignoreInserts('comments');
    await expect(repository.create(comment())).rejects.toThrow('Failed to create comment record');
  });
  it('keeps tied-timestamp comment refreshes and pages complete', async () => {
    const rows = await repository.createMany([comment('cursor', 1000), comment('cursor', 1000)]);
    expect(
      await repository.findByVideoIdWithTimestampFilter(
        'cursor',
        'after',
        'ascending',
        1000,
        rows[0].comment_id
      )
    ).toEqual([rows[1]]);
    expect(await repository.findByVideoId('cursor', { limit: 1, offset: 1 })).toEqual([rows[0]]);
  });
  it('loads older comments by timestamp and ID with a bounded lookahead', async () => {
    const rows = await repository.createMany(
      Array.from({ length: 205 }, () => comment('history', 1000))
    );
    const initial = (await repository.findByVideoId('history')).slice(0, 100);
    const cursor = initial.at(-1)!;
    await repository.create(comment('history', 1001));
    const next = await repository.findByVideoIdWithTimestampFilter(
      'history',
      'before',
      'descending',
      cursor.timestamp,
      cursor.comment_id
    );
    expect(next).toHaveLength(101);
    expect(next[0]!.comment_id).toBeLessThan(cursor.comment_id);
    const tail = next[99]!;
    const last = await repository.findByVideoIdWithTimestampFilter(
      'history',
      'before',
      'descending',
      tail.timestamp,
      tail.comment_id
    );
    expect(last).toHaveLength(5);
    expect(
      new Set([...initial, ...next.slice(0, 100), ...last].map((c) => c.comment_id)).size
    ).toBe(rows.length);
  });
  it('resolves quoted comments without knowing their timestamp and keeps video isolation', async () => {
    const row = await repository.create(comment('preview', 100));
    expect(await repository.findById('preview', row.comment_id)).toEqual(row);
    expect(await repository.findById('other-video', row.comment_id)).toBeNull();
    expect(await repository.findById('preview', row.comment_id, 200)).toBeNull();
  });
  it('finds backlinks across the full history with bounded pages, exact IDs and video isolation', async () => {
    const parent = await repository.create(comment('backlinks', 100));
    const target = parent.comment_id;
    await repository.createMany(
      Array.from({ length: 201 }, () => ({
        ...comment('backlinks', 200),
        comment_plain_text_sanitized: '&gt;&gt;' + target + ' and &gt;&gt;' + target,
      }))
    );
    await repository.create({
      ...comment('another-video', 300),
      comment_plain_text_sanitized: '&gt;&gt;' + target,
    });
    await repository.create({
      ...comment('backlinks', 300),
      comment_plain_text_sanitized: '&gt;&gt;' + target + '0',
    });
    await repository.create({
      ...comment('backlinks', 300),
      comment_plain_text_sanitized: '&gt;&gt;00' + target,
    });
    const service = new CommentsService({} as never, repository as never);
    const first = await service.getCommentBacklinks('backlinks', target);
    expect(first.replyIds).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    const second = await service.getCommentBacklinks('backlinks', target, first.replyIds.at(-1));
    expect(second.replyIds).toHaveLength(100);
    expect(second.hasMore).toBe(true);
    const last = await service.getCommentBacklinks('backlinks', target, second.replyIds.at(-1));
    expect(last.replyIds).toHaveLength(2);
    expect(last.hasMore).toBe(false);
    expect(new Set([...first.replyIds, ...second.replyIds, ...last.replyIds]).size).toBe(202);
  });
});
