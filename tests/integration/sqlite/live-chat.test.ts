import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLiveChatMessagesRepository } from '@database/repositories/live-chat-messages/index.js';
import { message, openTestDatabase } from './helpers.js';

describe('SQLite live chat (real SQL)', () => {
  let database: ReturnType<typeof openTestDatabase>;
  let repository: ReturnType<typeof createLiveChatMessagesRepository>;
  beforeEach(() => {
    database = openTestDatabase();
    repository = createLiveChatMessagesRepository('sqlite', database.db);
  });
  afterEach(() => database?.close());

  it('persists and retrieves messages with chronological limits and timestamp boundaries', async () => {
    expect(await repository.findById(-1)).toBeNull();
    expect(await repository.countByVideoId('a')).toBe(0);
    expect(await repository.createMany([])).toEqual([]);
    const first = await repository.create(message());
    expect(first).toMatchObject(message());
    expect(await repository.findById(first.chat_message_id)).toEqual(first);
    const rows = await repository.createMany([
      message('a', 200),
      message('a', 300),
      message('b', 150),
    ]);
    expect(await repository.findByVideoId('a')).toEqual([first, rows[0], rows[1]]);
    expect(await repository.findByVideoId('a', { limit: 1 })).toEqual([first]);
    expect(await repository.findAll()).toHaveLength(4);
    expect(await repository.findAll({})).toHaveLength(4);
    expect(await repository.findAll({ limit: 1 })).toHaveLength(1);
    expect(await repository.findAfterTimestamp('a', 200)).toEqual([rows[0], rows[1]]);
    expect(await repository.findAfterTimestamp('a', 200, 1)).toEqual([rows[0]]);
    expect(await repository.findRecentByVideoId('a')).toEqual([first, rows[0], rows[1]]);
    expect(await repository.findRecentByVideoId('a', 2)).toEqual([rows[0], rows[1]]);
    expect(await repository.delete(first.chat_message_id)).toBe(true);
    expect(await repository.delete(first.chat_message_id)).toBe(false);
    expect(await repository.deleteByVideoId('a')).toBe(2);
    expect(await repository.countByVideoId('b')).toBe(1);
    expect(await repository.deleteAll()).toBe(1);
    database.client.exec(
      'CREATE TRIGGER ignore_chat BEFORE INSERT ON livechatmessages BEGIN SELECT RAISE(IGNORE); END'
    );
    await expect(repository.create(message())).rejects.toThrow(
      'Failed to create live chat message record'
    );
  });

  it('retains the newest messages and leaves other videos untouched when pruning', async () => {
    await repository.createMany([
      message('a', 100),
      message('a', 200),
      message('a', 300),
      message('b', 50),
    ]);
    expect(await repository.pruneOldMessages('missing', 2)).toBe(0);
    expect(await repository.pruneOldMessages('a', 5)).toBe(0);
    expect(await repository.pruneOldMessages('a', 2)).toBe(1);
    expect((await repository.findByVideoId('a')).map((row) => row.timestamp)).toEqual([200, 300]);
    expect(await repository.countByVideoId('b')).toBe(1);
    expect(await repository.pruneOldMessages('a', 0)).toBe(0);
  });
});
