import { ReportsVideosRepositorySQLite } from '@database/repositories/reports-videos/sqlite.js';
import { ReportsVideosRepositoryPostgres } from '@database/repositories/reports-videos/postgres.js';
import type { IReportsVideosRepository } from '@database/repositories/reports-videos/interface.js';
import type { DrizzleVideoReport as SQLiteVideoReport, DrizzleNewVideoReport as SQLiteNewVideoReport } from '@database/schemas/sqlite/reports-videos.js';
import type { DrizzleVideoReport as PostgresVideoReport, DrizzleNewVideoReport as PostgresNewVideoReport } from '@database/schemas/postgres/reports-videos.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createReportsVideosRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport>;

export function createReportsVideosRepository(
  dialect: 'postgres',
  db: PostgresClient
): IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>;

export function createReportsVideosRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport> | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport> {
  if (dialect === 'sqlite') {
    return new ReportsVideosRepositorySQLite(db as SQLiteClient);
  }
  return new ReportsVideosRepositoryPostgres(db as PostgresClient);
}

export type { IReportsVideosRepository } from '@database/repositories/reports-videos/interface.js';
export type { DrizzleVideoReport as SQLiteVideoReport, DrizzleNewVideoReport as SQLiteNewVideoReport } from '@database/schemas/sqlite/reports-videos.js';
export type { DrizzleVideoReport as PostgresVideoReport, DrizzleNewVideoReport as PostgresNewVideoReport } from '@database/schemas/postgres/reports-videos.js';