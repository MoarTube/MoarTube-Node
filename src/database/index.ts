/**
 * Database module barrel export
 *
 * This file exports all database-related modules for convenient importing.
 */

// Connection management
export {
  createDatabase,
  getDatabase,
  isDatabaseInitialized,
  getCurrentDialect,
  closeDatabase,
  getRawSqliteDb,
  getRawPostgresClient,
  isSqliteDb,
  isPostgresDb,
  type DatabaseConfig,
  type DatabaseClient,
} from './connection';

// Cluster wrapper
export {
  ClusterDatabaseWrapper,
  getClusterDatabaseWrapper,
  createClusterDatabaseWrapper,
  resetClusterDatabaseWrapper,
} from './cluster-wrapper';

// Write queue
export {
  WriteQueue,
  getWriteQueue,
  resetWriteQueue,
  type DatabaseWriteJobMessage,
  type DatabaseWriteJobResultMessage,
} from './write-queue';

// Schema exports
export * from './schema';

// Repository exports
export * from './repositories';
