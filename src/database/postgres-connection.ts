/**
 * PostgreSQL database connection module for Drizzle ORM
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgresDatabase from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '@database/schemas/postgres/index.js';
import { DrizzleQueryError } from 'drizzle-orm/errors';

/**
 * Database configuration interface for PostgreSQL
 */
export interface DatabaseConfig {
  connectionString: string;
}

export type DatabaseClient = PostgresJsDatabase<typeof schema>;

/**
 * Drizzle PostgreSQL database instance
 */
let drizzleDb: PostgresJsDatabase<typeof schema> | null = null;

/**
 * PostgreSQL client instance (for raw access)
 */
let databaseClient: postgresDatabase.Sql | null = null;

/**
 * Creates a PostgreSQL database connection
 *
 * @param config - PostgreSQL database configuration
 * @returns Drizzle ORM PostgreSQL database instance
 * @throws Error if configuration is invalid or connection fails
 */
export function createDatabase(config: DatabaseConfig): PostgresJsDatabase<typeof schema> {
  if (!config.connectionString) {
    throw new Error('PostgreSQL connection string is required');
  }

  databaseClient = postgresDatabase(config.connectionString);
  drizzleDb = drizzle(databaseClient, { schema });

  return drizzleDb;
}

export async function initializeDatabaseSchema(): Promise<void> {
  if (!drizzleDb || !databaseClient) {
    throw new Error('PostgreSQL database not initialized. Call createDatabase() first.');
  }

  try {
    // Try to create the drizzle schema if it doesn't exist
    // This may fail if the user doesn't have CREATE SCHEMA permission, but that's OK if the schema already exists
    try {
      await databaseClient`CREATE SCHEMA IF NOT EXISTS drizzle`;
    } catch {
      // Schema creation failed - this is OK if the schema already exists
      // Warning: Could not create drizzle schema, assuming it already exists
    }

    // Resolve migrations folder path relative to project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..', '..');
    const migrationsFolder = path.join(projectRoot, 'drizzle', 'postgres');

    await migrate(drizzleDb, { migrationsFolder });
  } catch (error) {
    if (error instanceof DrizzleQueryError && error.cause?.message.includes('already exists') === true) {
        return;
    }

    throw new Error(`Failed to initialize PostgreSQL database schema: ${String(error)}`);
  }
}

/**
 * Gets the current PostgreSQL database instance
 *
 * @returns The current Drizzle ORM PostgreSQL database instance
 * @throws Error if database has not been initialized
 */
export function getDatabase(): PostgresJsDatabase<typeof schema> {
  if (!drizzleDb) {
    throw new Error('PostgreSQL database not initialized. Call createDatabase() first.');
  }
  return drizzleDb;
}

/**
 * Checks if the PostgreSQL database has been initialized
 *
 * @returns true if database is initialized, false otherwise
 */
export function isDatabaseInitialized(): boolean {
  return drizzleDb !== null;
}

/**
 * Gets the raw PostgreSQL client instance
 *
 * @returns The raw postgres.js client instance
 * @throws Error if database has not been initialized
 */
export function getRawClient(): postgresDatabase.Sql {
  if (!databaseClient) {
    throw new Error('PostgreSQL database not initialized. Call createDatabase() first.');
  }
  return databaseClient;
}

/**
 * Closes the PostgreSQL database connection
 */
export async function closeDatabase(): Promise<void> {
  if (databaseClient) {
    await databaseClient.end();
    databaseClient = null;
    drizzleDb = null;
  }
}