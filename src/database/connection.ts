/**
 * Database connection module for Drizzle ORM
 *
 * Supports both SQLite (via better-sqlite3) and PostgreSQL (via postgres.js).
 * The connection type is determined by the database configuration.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  /** Database dialect: 'sqlite' or 'postgres' */
  dialect: 'sqlite' | 'postgres';
  /** Path to SQLite database file (for SQLite) */
  filepath?: string;
  /** Connection string (for PostgreSQL) */
  connectionString?: string;
}

/**
 * Database client type - currently SQLite only
 * PostgreSQL support will be added in a future phase
 */
export type DatabaseClient = BetterSQLite3Database<typeof schema>;

/**
 * SQLite database connection instance
 */
let sqliteDb: Database.Database | null = null;

/**
 * Drizzle database instance
 */
let drizzleDb: DatabaseClient | null = null;

/**
 * Current database dialect
 */
let currentDialect: 'sqlite' | 'postgres' | null = null;

/**
 * Creates a database connection based on the provided configuration
 *
 * @param config - Database configuration specifying dialect and connection details
 * @returns Drizzle ORM database instance
 * @throws Error if configuration is invalid or connection fails
 *
 * @example
 * // SQLite connection
 * const db = createDatabase({ dialect: 'sqlite', filepath: './data/db/node_db.sqlite' });
 */
export function createDatabase(config: DatabaseConfig): DatabaseClient {
  if (config.dialect === 'sqlite') {
    if (!config.filepath) {
      throw new Error('SQLite filepath is required');
    }

    sqliteDb = new Database(config.filepath);

    // Enable WAL mode for better concurrent performance
    sqliteDb.pragma('journal_mode = WAL');

    drizzleDb = drizzle(sqliteDb, { schema });
    currentDialect = 'sqlite';
    return drizzleDb;
  } else if (config.dialect === 'postgres') {
    // PostgreSQL support will be implemented in a future phase
    // For now, throw an error indicating it's not yet supported
    throw new Error(
      'PostgreSQL support is not yet implemented. ' +
        'Please use SQLite for now. PostgreSQL will be added in a future phase.'
    );
  }

  throw new Error(`Unsupported database dialect: ${String(config.dialect)}`);
}

/**
 * Gets the current database instance
 *
 * @returns The current Drizzle ORM database instance
 * @throws Error if database has not been initialized
 */
export function getDatabase(): DatabaseClient {
  if (!drizzleDb) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
  return drizzleDb;
}

/**
 * Checks if the database has been initialized
 *
 * @returns true if database is initialized, false otherwise
 */
export function isDatabaseInitialized(): boolean {
  return drizzleDb !== null;
}

/**
 * Gets the current database dialect
 *
 * @returns The current dialect or null if not initialized
 */
export function getCurrentDialect(): 'sqlite' | 'postgres' | null {
  return currentDialect;
}

/**
 * Closes the database connection and cleans up resources
 *
 * Should be called during application shutdown for graceful cleanup.
 */
export function closeDatabase(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }

  drizzleDb = null;
  currentDialect = null;
}

/**
 * Gets the raw SQLite database instance for direct access
 *
 * @returns The raw better-sqlite3 Database instance, or null if not using SQLite
 */
export function getRawSqliteDb(): Database.Database | null {
  return sqliteDb;
}

/**
 * Gets the raw PostgreSQL client for direct access
 *
 * @returns null - PostgreSQL not yet supported
 * @deprecated PostgreSQL support coming in future phase
 */
export function getRawPostgresClient(): null {
  return null;
}

/**
 * Type guard to check if the database client is SQLite
 */
export function isSqliteDb(): boolean {
  return currentDialect === 'sqlite';
}

/**
 * Type guard to check if the database client is PostgreSQL
 */
export function isPostgresDb(): boolean {
  return currentDialect === 'postgres';
}
