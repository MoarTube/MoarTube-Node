import { LinksRepositorySQLite } from '@database/repositories/links/sqlite.js';
import { LinksRepositoryPostgres } from '@database/repositories/links/postgres.js';
import type { ILinksRepository } from '@database/repositories/links/interface.js';
import type { DrizzleLink as SQLiteLink, DrizzleNewLink as SQLiteNewLink } from '@database/schemas/sqlite/links.js';
import type { DrizzleLink as PostgresLink, DrizzleNewLink as PostgresNewLink } from '@database/schemas/postgres/links.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createLinksRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): ILinksRepository<SQLiteLink, SQLiteNewLink>;

export function createLinksRepository(
  dialect: 'postgres',
  db: PostgresClient
): ILinksRepository<PostgresLink, PostgresNewLink>;

export function createLinksRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): ILinksRepository<SQLiteLink, SQLiteNewLink> | ILinksRepository<PostgresLink, PostgresNewLink> {
  if (dialect === 'sqlite') {
    return new LinksRepositorySQLite(db as SQLiteClient);
  }
  return new LinksRepositoryPostgres(db as PostgresClient);
}

export type { ILinksRepository } from '@database/repositories/links/interface.js';