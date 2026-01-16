import { MonetizationRepositorySQLite } from '@database/repositories/monetization/sqlite.js';
import { MonetizationRepositoryPostgres } from '@database/repositories/monetization/postgres.js';
import type { IMonetizationRepository } from '@database/repositories/monetization/interface.js';
import type { DrizzleCryptoWalletAddress as SQLiteCryptoWalletAddress, DrizzleNewCryptoWalletAddress as SQLiteNewCryptoWalletAddress } from '@database/schemas/sqlite/monetization.js';
import type { DrizzleCryptoWalletAddress as PostgresCryptoWalletAddress, DrizzleNewCryptoWalletAddress as PostgresNewCryptoWalletAddress } from '@database/schemas/postgres/monetization.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';

export function createMonetizationRepository(
  dialect: 'sqlite',
  db: SQLiteClient
): IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress>;

export function createMonetizationRepository(
  dialect: 'postgres',
  db: PostgresClient
): IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>;

export function createMonetizationRepository(
  dialect: 'sqlite' | 'postgres',
  db: SQLiteClient | PostgresClient
): IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress> {
  if (dialect === 'sqlite') {
    return new MonetizationRepositorySQLite(db as SQLiteClient);
  }
  return new MonetizationRepositoryPostgres(db as PostgresClient);
}

export type { IMonetizationRepository } from '@database/repositories/monetization/interface.js';