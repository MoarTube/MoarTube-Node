import { CommentsRepositorySQLite } from '@database/repositories/comments/sqlite.js';
import { CommentsRepositoryPostgres } from '@database/repositories/comments/postgres.js';
import type { ICommentsRepository } from '@database/repositories/comments/interface.js';
import type { DrizzleComment as SQLiteComment, DrizzleNewComment as SQLiteNewComment } from '@database/schemas/sqlite/comments.js';
import type { DrizzleComment as PostgresComment, DrizzleNewComment as PostgresNewComment } from '@database/schemas/postgres/comments.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createCommentsRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): ICommentsRepository<SQLiteComment, SQLiteNewComment>;

export function createCommentsRepository(
  dialect: 'postgres',
  db: PostgresClient
): ICommentsRepository<PostgresComment, PostgresNewComment>;

export function createCommentsRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): ICommentsRepository<SQLiteComment, SQLiteNewComment> | ICommentsRepository<PostgresComment, PostgresNewComment> {
  if (dialect === 'sqlite') {
    return new CommentsRepositorySQLite(db as SQLiteClient);
  }
  return new CommentsRepositoryPostgres(db as PostgresClient);
}

export type { ICommentsRepository } from '@database/repositories/comments/interface.js';
export type { DrizzleComment as SQLiteComment, DrizzleNewComment as SQLiteNewComment } from '@database/schemas/sqlite/comments.js';
export type { DrizzleComment as PostgresComment, DrizzleNewComment as PostgresNewComment } from '@database/schemas/postgres/comments.js';
