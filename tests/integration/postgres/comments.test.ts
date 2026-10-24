import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCommentsRepository } from '@database/repositories/comments/index.js';
import { comment, openTestDatabase } from './helpers.js';

describe('PostgreSQL comments (real SQL)', () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>>;
  let repository: ReturnType<typeof createCommentsRepository>;

  beforeEach(async () => {
    database = await openTestDatabase();
    repository = createCommentsRepository('postgres', database.db);
  });
  afterEach(() => database?.close());

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
});
