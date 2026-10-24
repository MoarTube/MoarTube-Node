/**
 * SQLite database connection module for Drizzle ORM
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sqliteDatabase from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '@database/schemas/sqlite/index.js';

/**
 * Database configuration interface for SQLite
 */
export interface DatabaseConfig {
  filepath: string;
}

export type DatabaseClient = BetterSQLite3Database<typeof schema>;

/**
 * Drizzle SQLite database instance
 */
let connection: {
  db: BetterSQLite3Database<typeof schema>;
  client: sqliteDatabase.Database;
} | null = null;

/** Resolve the migrations shipped beside a bundle or in the source project. */
export function resolveMigrationsFolder(moduleUrl: string): string {
  const filename = fileURLToPath(moduleUrl);
  const dirname = path.dirname(filename);
  const isBundled = dirname.includes('dist') || !filename.includes('database');
  return isBundled
    ? path.join(dirname, 'drizzle', 'sqlite')
    : path.resolve(dirname, '..', '..', 'drizzle', 'sqlite');
}

/**
 * Creates a SQLite database connection
 *
 * @param config - SQLite database configuration
 * @returns Drizzle ORM SQLite database instance
 * @throws Error if configuration is invalid or connection fails
 */
export function createDatabase(config: DatabaseConfig): BetterSQLite3Database<typeof schema> {
  if (!config.filepath) {
    throw new Error('SQLite filepath is required');
  }

  const sqliteDb = new sqliteDatabase(config.filepath);

  sqliteDb.exec('VACUUM');

  // Enable WAL mode for better concurrent performance
  // sqliteDb.pragma('journal_mode = WAL');

  const drizzleDb = drizzle(sqliteDb, { schema });
  connection = { db: drizzleDb, client: sqliteDb };

  return drizzleDb;
}

/**
 * Initialize the SQLite database schema by running migrations
 *
 * @throws Error if database is not initialized or migration fails
 */
export function initializeDatabaseSchema(): void {
  if (!connection) {
    throw new Error('SQLite database not initialized. Call createDatabase() first.');
  }

  try {
    // Resolve migrations folder path
    // In development (tsx): src/database/sqlite-connection.ts -> ../../drizzle/sqlite
    // In production (bundled): dist/moartube-node.js -> ./drizzle/sqlite (copied by tsup)
    const migrationsFolder = resolveMigrationsFolder(import.meta.url);
    migrate(connection.db, { migrationsFolder });
    connection.client.exec('VACUUM');
  } catch (error) {
    throw new Error(`Failed to initialize SQLite database schema: ${String(error)}`);
  }
}

/**
 * Gets the current SQLite database instance
 *
 * @returns The current Drizzle ORM SQLite database instance
 * @throws Error if database has not been initialized
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!connection) {
    throw new Error('SQLite database not initialized. Call createDatabase() first.');
  }
  return connection.db;
}
