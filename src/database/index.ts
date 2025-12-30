/**
 * Database module barrel export
 *
 * This file exports all database-related modules for convenient importing.
 */

// Connection management
export {
  createDatabase,
  initializeDatabaseSchema,
  getDatabase,
  isDatabaseInitialized,
  getCurrentDialect,
  type DatabaseConfig,
  type DatabaseClient,
} from '@database/connection.js';

// Schema exports
export * from '@database/schemas/sqlite/index.js';
