import { ReportsArchiveCommentsRepositorySQLite } from '@database/repositories/reports-archive-comments/sqlite.js';
import { ReportsArchiveCommentsRepositoryPostgres } from '@database/repositories/reports-archive-comments/postgres.js';
import type { IReportsArchiveCommentsRepository } from '@database/repositories/reports-archive-comments/interface.js';
import type {
  DrizzleCommentReportArchive as SQLiteCommentReportArchive,
  DrizzleNewCommentReportArchive as SQLiteNewCommentReportArchive,
} from '@database/schemas/sqlite/reports-archive-comments.js';
import type {
  DrizzleCommentReportArchive as PostgresCommentReportArchive,
  DrizzleNewCommentReportArchive as PostgresNewCommentReportArchive,
} from '@database/schemas/postgres/reports-archive-comments.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createReportsArchiveCommentsRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive>;

export function createReportsArchiveCommentsRepository(
  dialect: 'postgres',
  db: PostgresClient
): IReportsArchiveCommentsRepository<PostgresCommentReportArchive, PostgresNewCommentReportArchive>;

export function createReportsArchiveCommentsRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
):
  | IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive>
  | IReportsArchiveCommentsRepository<
      PostgresCommentReportArchive,
      PostgresNewCommentReportArchive
    > {
  if (dialect === 'sqlite') {
    return new ReportsArchiveCommentsRepositorySQLite(db as SQLiteClient);
  }
  return new ReportsArchiveCommentsRepositoryPostgres(db as PostgresClient);
}

export type { IReportsArchiveCommentsRepository } from '@database/repositories/reports-archive-comments/interface.js';
