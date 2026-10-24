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
let connection: {
  db: PostgresJsDatabase<typeof schema>;
  client: postgresDatabase.Sql;
} | null = null;

/** Resolve the migrations shipped beside a bundle or in the source project. */
export function resolveMigrationsFolder(moduleUrl: string): string {
  const filename = fileURLToPath(moduleUrl);
  const dirname = path.dirname(filename);
  const isBundled = dirname.includes('dist') || !filename.includes('database');
  return isBundled
    ? path.join(dirname, 'drizzle', 'postgres')
    : path.resolve(dirname, '..', '..', 'drizzle', 'postgres');
}

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

  const databaseClient = postgresDatabase(config.connectionString);
  const drizzleDb = drizzle(databaseClient, { schema });
  connection = { db: drizzleDb, client: databaseClient };

  return drizzleDb;
}

export async function initializeDatabaseSchema(): Promise<void> {
  if (!connection) {
    throw new Error('PostgreSQL database not initialized. Call createDatabase() first.');
  }

  try {
    // Try to create the drizzle schema if it doesn't exist
    // This may fail if the user doesn't have CREATE SCHEMA permission, but that's OK if the schema already exists
    try {
      await connection.client`CREATE SCHEMA IF NOT EXISTS drizzle`;
    } catch {
      // Schema creation failed - this is OK if the schema already exists
      // Warning: Could not create drizzle schema, assuming it already exists
    }

    // Resolve migrations folder path
    // In development (tsx): src/database/postgres-connection.ts -> ../../drizzle/postgres
    // In production (bundled): dist/moartube-node.js -> ./drizzle/postgres (copied by tsup)
    const migrationsFolder = resolveMigrationsFolder(import.meta.url);
    await migrate(connection.db, { migrationsFolder });
  } catch (error) {
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
  if (!connection) {
    throw new Error('PostgreSQL database not initialized. Call createDatabase() first.');
  }
  return connection.db;
}
