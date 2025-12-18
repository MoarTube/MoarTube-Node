/**
 * Database connection module for Drizzle ORM
 *
 * Supports both SQLite (via better-sqlite3) and PostgreSQL (via postgres.js).
 * The connection type is determined by the database configuration.
 */

import {
  createDatabase as createSqliteDatabase,
  initializeDatabaseSchema as initializeSqliteDatabaseSchema,
  getDatabase as getSqliteDatabase,
  isDatabaseInitialized as isSqliteDatabaseInitialized,
  getRawClient as getRawSqliteDbInternal,
  closeDatabase as closeSqliteDatabase,
  type DatabaseConfig as SqliteDatabaseConfig,
  type DatabaseClient as SqliteDatabaseClient
} from './sqlite-connection.js';

import {
  createDatabase as createPostgresDatabase,
  initializeDatabaseSchema as initializePostgresDatabaseSchema,
  getDatabase as getPostgresDatabase,
  isDatabaseInitialized as isPostgresDatabaseInitialized,
  getRawClient as getRawPostgresClientInternal,
  closeDatabase as closePostgresDatabase,
  type DatabaseConfig as PostgresDatabaseConfig,
  type DatabaseClient as PostgresDatabaseClient
} from './postgres-connection.js';

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
 * Database client type
 */
export type DatabaseClient = SqliteDatabaseClient | PostgresDatabaseClient;

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
 */
export function createDatabase(config: DatabaseConfig): DatabaseClient {
  if (config.dialect === 'sqlite') {
    currentDialect = 'sqlite';
    return createSqliteDatabase(config as SqliteDatabaseConfig);
  } else {
    currentDialect = 'postgres';
    return createPostgresDatabase(config as PostgresDatabaseConfig);
  }
}

/**
 * Initialize the database schema by running migrations
 *
 * This should be called after createDatabase() to ensure the database schema is up to date.
 * Runs the migration files to create tables and apply schema changes.
 *
 * @throws Error if database is not initialized or migration fails
 */
export async function initializeDatabaseSchema(): Promise<void> {
  if (!currentDialect) {
    throw new Error('Database dialect not set. Call createDatabase() first.');
  }

  if (currentDialect === 'sqlite') {
    initializeSqliteDatabaseSchema();
  } else {
    await initializePostgresDatabaseSchema();
  }
}

/**
 * Gets the current database instance
 *
 * @returns The current Drizzle ORM database instance
 * @throws Error if database has not been initialized
 */
export function getDatabase(): DatabaseClient {
  if (currentDialect === 'sqlite') {
    return getSqliteDatabase();
  } else if (currentDialect === 'postgres') {
    return getPostgresDatabase();
  } else {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
}

/**
 * Checks if the database has been initialized
 *
 * @returns true if database is initialized, false otherwise
 */
export function isDatabaseInitialized(): boolean {
  if (currentDialect === 'sqlite') {
    return isSqliteDatabaseInitialized();
  } else if (currentDialect === 'postgres') {
    return isPostgresDatabaseInitialized();
  }
  return false;
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
 * Gets the raw SQLite database instance (only works for SQLite)
 *
 * @returns The raw better-sqlite3 database instance
 * @throws Error if not using SQLite or database not initialized
 */
export function getRawSqliteDb(): unknown {
  if (currentDialect !== 'sqlite') {
    throw new Error('Raw SQLite database access only available when using SQLite dialect');
  }
  return getRawSqliteDbInternal();
}

/**
 * Gets the raw PostgreSQL client instance (only works for PostgreSQL)
 *
 * @returns The raw postgres.js client instance
 * @throws Error if not using PostgreSQL or database not initialized
 */
export function getRawPostgresClient(): unknown {
  if (currentDialect !== 'postgres') {
    throw new Error('Raw PostgreSQL client access only available when using PostgreSQL dialect');
  }
  return getRawPostgresClientInternal();
}

/**
 * Checks if the current database is SQLite
 *
 * @returns true if using SQLite, false otherwise
 */
export function isSqliteDb(): boolean {
  return currentDialect === 'sqlite';
}

/**
 * Checks if the current database is PostgreSQL
 *
 * @returns true if using PostgreSQL, false otherwise
 */
export function isPostgresDb(): boolean {
  return currentDialect === 'postgres';
}

/**
 * Closes the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (currentDialect === 'sqlite') {
    closeSqliteDatabase();
  } else if (currentDialect === 'postgres') {
    await closePostgresDatabase();
  }
  currentDialect = null;
}
