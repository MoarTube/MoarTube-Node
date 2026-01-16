import { LiveChatMessagesRepositorySQLite } from '@database/repositories/live-chat-messages/sqlite.js';
import { LiveChatMessagesRepositoryPostgres } from '@database/repositories/live-chat-messages/postgres.js';
import type { ILiveChatMessagesRepository } from '@database/repositories/live-chat-messages/interface.js';
import type { DrizzleLiveChatMessage as SQLiteLiveChatMessage, DrizzleNewLiveChatMessage as SQLiteNewLiveChatMessage } from '@database/schemas/sqlite/live-chat-messages.js';
import type { DrizzleLiveChatMessage as PostgresLiveChatMessage, DrizzleNewLiveChatMessage as PostgresNewLiveChatMessage } from '@database/schemas/postgres/live-chat-messages.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createLiveChatMessagesRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage>;

export function createLiveChatMessagesRepository(
  dialect: 'postgres',
  db: PostgresClient
): ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>;

export function createLiveChatMessagesRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage> | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage> {
  if (dialect === 'sqlite') {
    return new LiveChatMessagesRepositorySQLite(db as SQLiteClient);
  }
  return new LiveChatMessagesRepositoryPostgres(db as PostgresClient);
}

export type { ILiveChatMessagesRepository } from '@database/repositories/live-chat-messages/interface.js';