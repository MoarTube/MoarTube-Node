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
} from './connection.js';

// Cluster wrapper
export {
  ClusterDatabaseWrapper,
  getClusterDatabaseWrapper,
  createClusterDatabaseWrapper,
  resetClusterDatabaseWrapper,
} from './cluster-wrapper.js';

// Write queue
export {
  WriteQueue,
  getWriteQueue,
  resetWriteQueue,
  type DatabaseWriteJobMessage,
  type DatabaseWriteJobResultMessage,
} from './write-queue.js';

// Schema exports
export * from './schemas/sqlite/index.js';

// Repository exports - removed as repositories are now dialect-specific
// export * from './repositories/index.js';
