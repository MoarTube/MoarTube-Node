import { ReportsArchiveVideosRepositorySQLite } from '@database/repositories/reports-archive-videos/sqlite.js';
import { ReportsArchiveVideosRepositoryPostgres } from '@database/repositories/reports-archive-videos/postgres.js';
import type { IReportsArchiveVideosRepository } from '@database/repositories/reports-archive-videos/interface.js';
import type {
  DrizzleVideoReportArchive as SQLiteVideoReportArchive,
  DrizzleNewVideoReportArchive as SQLiteNewVideoReportArchive,
} from '@database/schemas/sqlite/reports-archive-videos.js';
import type {
  DrizzleVideoReportArchive as PostgresVideoReportArchive,
  DrizzleNewVideoReportArchive as PostgresNewVideoReportArchive,
} from '@database/schemas/postgres/reports-archive-videos.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createReportsArchiveVideosRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive>;

export function createReportsArchiveVideosRepository(
  dialect: 'postgres',
  db: PostgresClient
): IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>;

export function createReportsArchiveVideosRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
):
  | IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive>
  | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive> {
  if (dialect === 'sqlite') {
    return new ReportsArchiveVideosRepositorySQLite(db as SQLiteClient);
  }
  return new ReportsArchiveVideosRepositoryPostgres(db as PostgresClient);
}

export type { IReportsArchiveVideosRepository } from '@database/repositories/reports-archive-videos/interface.js';
