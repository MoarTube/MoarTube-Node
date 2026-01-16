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

    // Resolve migrations folder path
    // In development (tsx): src/database/postgres-connection.ts -> ../../drizzle/postgres
    // In production (bundled): dist/moartube-node.js -> ./drizzle/postgres (copied by tsup)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Check if we're running from the bundled dist file or from source
    const isBundled = __dirname.includes('dist') || !__filename.includes('database');
    const migrationsFolder = isBundled
      ? path.join(__dirname, 'drizzle', 'postgres')
      : path.resolve(__dirname, '..', '..', 'drizzle', 'postgres');

    await migrate(drizzleDb, { migrationsFolder });
  } catch (error) {
    if (
      error instanceof DrizzleQueryError &&
      error.cause?.message.includes('already exists') === true
    ) {
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
