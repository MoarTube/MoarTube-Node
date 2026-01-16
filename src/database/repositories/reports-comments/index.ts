import { ReportsCommentsRepositorySQLite } from '@database/repositories/reports-comments/sqlite.js';
import { ReportsCommentsRepositoryPostgres } from '@database/repositories/reports-comments/postgres.js';
import type { IReportsCommentsRepository } from '@database/repositories/reports-comments/interface.js';
import type { DrizzleCommentReport as SQLiteCommentReport, DrizzleNewCommentReport as SQLiteNewCommentReport } from '@database/schemas/sqlite/reports-comments.js';
import type { DrizzleCommentReport as PostgresCommentReport, DrizzleNewCommentReport as PostgresNewCommentReport } from '@database/schemas/postgres/reports-comments.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createReportsCommentsRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport>;

export function createReportsCommentsRepository(
  dialect: 'postgres',
  db: PostgresClient
): IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>;

export function createReportsCommentsRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport> | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport> {
  if (dialect === 'sqlite') {
    return new ReportsCommentsRepositorySQLite(db as SQLiteClient);
  }
  return new ReportsCommentsRepositoryPostgres(db as PostgresClient);
}

export type { IReportsCommentsRepository } from '@database/repositories/reports-comments/interface.js';
export type { DrizzleCommentReport as SQLiteCommentReport, DrizzleNewCommentReport as SQLiteNewCommentReport } from '@database/schemas/sqlite/reports-comments.js';
export type { DrizzleCommentReport as PostgresCommentReport, DrizzleNewCommentReport as PostgresNewCommentReport } from '@database/schemas/postgres/reports-comments.js';