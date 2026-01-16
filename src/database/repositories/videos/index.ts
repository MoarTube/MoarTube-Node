import { VideosRepositorySQLite } from '@database/repositories/videos/sqlite.js';
import { VideosRepositoryPostgres } from '@database/repositories/videos/postgres.js';
import type { IVideosRepository } from '@database/repositories/videos/interface.js';
import type { DrizzleVideo as SQLiteVideo, DrizzleNewVideo as SQLiteNewVideo } from '@database/schemas/sqlite/videos.js';
import type { DrizzleVideo as PostgresVideo, DrizzleNewVideo as PostgresNewVideo } from '@database/schemas/postgres/videos.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createVideosRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IVideosRepository<SQLiteVideo, SQLiteNewVideo>;

export function createVideosRepository(
  dialect: 'postgres',
  db: PostgresClient
): IVideosRepository<PostgresVideo, PostgresNewVideo>;

export function createVideosRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): IVideosRepository<SQLiteVideo, SQLiteNewVideo> | IVideosRepository<PostgresVideo, PostgresNewVideo> {
  if (dialect === 'sqlite') {
    return new VideosRepositorySQLite(db as SQLiteClient);
  }
  return new VideosRepositoryPostgres(db as PostgresClient);
}

export type { IVideosRepository, VideoQueryOptions } from '@database/repositories/videos/interface.js';