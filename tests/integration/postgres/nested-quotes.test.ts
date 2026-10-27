import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import * as connection from '@/database/postgres-connection.js';
import { openTestDatabase, comment } from './helpers.js';

const quote = (level: number, id: number) => '&gt;'.repeat(level) + id;
describe('direct replies and quoted references (postgres)', () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>>;
  let repository: ReturnType<typeof createCommentsRepository>;
  beforeEach(async () => {
    database = await openTestDatabase();
    repository = createCommentsRepository('postgres', database.db);
  });
  afterEach(async () => {
    await database?.close();
  });
  it.each([
    ['a nested reply header', (a: number, b: number) => `${quote(2, b)}\n${quote(3, a)}`],
    [
      'a quoted line containing another reference',
      (a: number, b: number) => `${quote(2, b)}\n&gt;quoted ${quote(2, a)}`,
    ],
    [
      'quoted text with a doubled nonnumeric prefix',
      (a: number, b: number) => `${quote(2, b)}\n&gt;&gt;quoted ${quote(2, a)}`,
    ],
    [
      'even-depth nested quoting',
      (a: number, b: number) => `${quote(2, b)}\n${quote(4, a)}\n${quote(6, a)}`,
    ],
    ['deep inline quoting', (a: number, b: number) => `Text ${quote(7, a)} then ${quote(2, b)}`],
    ['indented CRLF quoting', (a: number, b: number) => ` \t${quote(3, a)}\r\n \t${quote(2, b)}`],
    ['Unicode whitespace', (a: number, b: number) => `\u00a0${quote(3, a)}\n\u2003${quote(2, b)}`],
  ])('ignores %s while retaining the direct reference', async (_name, text) => {
    const a = await repository.create(comment('a', 1));
    const b = await repository.create(comment('a', 2));
    const reply = await repository.create({
      ...comment('a', 3),
      comment_plain_text_sanitized: text(a.comment_id, b.comment_id),
    });
    expect(await repository.getBacklinksForComments('a', [a.comment_id])).toEqual([]);
    expect(await repository.getBacklinksForComments('a', [b.comment_id])).toEqual([
      { parent_id: b.comment_id, reply_id: reply.comment_id },
    ]);
  });
  it('preserves adjacent, repeated and zero-padded direct references', async () => {
    const a = await repository.create(comment('a', 1));
    const b = await repository.create(comment('a', 2));
    const reply = await repository.create({
      ...comment('a', 3),
      comment_plain_text_sanitized: `${quote(2, a.comment_id)}${quote(2, b.comment_id)} ${quote(2, a.comment_id)} &gt;&gt;000${b.comment_id}`,
    });
    expect(await repository.getBacklinksForComments('a', [a.comment_id, b.comment_id])).toEqual(
      expect.arrayContaining([
        { parent_id: a.comment_id, reply_id: reply.comment_id },
        { parent_id: b.comment_id, reply_id: reply.comment_id },
      ])
    );
    expect(
      await repository.getBacklinksForComments('a', [a.comment_id, b.comment_id])
    ).toHaveLength(2);
  });
  it('edits and deletes update only actual reply relationships and their change markers', async () => {
    const a = await repository.create(comment('a', 1));
    const b = await repository.create(comment('a', 2));
    const reply = await repository.create({
      ...comment('a', 3),
      comment_plain_text_sanitized: quote(2, a.comment_id),
    });
    const before = await repository.getCacheVersion('a');
    await repository.update(reply.comment_id, {
      comment_plain_text_sanitized: `${quote(2, b.comment_id)}\n${quote(3, a.comment_id)}`,
    });
    expect(await repository.getBacklinksForComments('a', [a.comment_id])).toEqual([]);
    expect((await repository.getCacheChanges('a', before)).map((row) => row.comment_id)).toEqual(
      expect.arrayContaining([a.comment_id, b.comment_id, reply.comment_id])
    );
    const edited = await repository.getCacheVersion('a');
    await repository.delete('a', reply.comment_id, 3);
    const changes = await repository.getCacheChanges('a', edited);
    expect(changes.map((row) => row.comment_id)).toContain(b.comment_id);
    expect(changes.map((row) => row.comment_id)).not.toContain(a.comment_id);
  });
  it('rebuilds legacy relationships without changing comment text and rotates browser/CDN identity once', async () => {
    const a = await repository.create(comment('a', 1));
    const b = await repository.create(comment('a', 2));
    const text = `${quote(2, b.comment_id)}\n${quote(3, a.comment_id)}`;
    const reply = await repository.create({
      ...comment('a', 3),
      comment_plain_text_sanitized: text,
    });
    const epoch = await repository.getCacheEpoch();
    await database.client`INSERT INTO comment_edges(video_id,parent_id,reply_id) VALUES('a',${a.comment_id},${reply.comment_id}) ON CONFLICT DO NOTHING`;
    await database.client`UPDATE database_meta SET value='old-parser' WHERE key='comment_cache_provision'`;
    await connection.initializeDatabaseSchema();
    expect(await repository.getCacheEpoch()).not.toBe(epoch);
    expect(await repository.getBacklinksForComments('a', [a.comment_id])).toEqual([]);
    expect(await repository.getBacklinksForComments('a', [b.comment_id])).toEqual([
      { parent_id: b.comment_id, reply_id: reply.comment_id },
    ]);
    expect((await repository.findById('a', reply.comment_id))?.comment_plain_text_sanitized).toBe(
      text
    );
    expect(await repository.countByVideoId('a')).toBe(3);
    const repaired = await repository.getCacheEpoch();
    const revision = await repository.getCacheVersion('a');
    await connection.initializeDatabaseSchema();
    expect(await repository.getCacheEpoch()).toBe(repaired);
    expect(await repository.getCacheVersion('a')).toBe(revision);
  });
});
