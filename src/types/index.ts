/**
 * Shared type definitions - only the actually used types
 * TODO: Consider removing this barrel export and importing directly from specific files
 */

// Only the types that are actually imported from this barrel export
export type {
  DatabaseConfig,
  StorageConfig,
  IndexerConfig,
  AliaserConfig,
  NodeSettings,
  NodeIdentification,
  LastCheckedContentTracker,
} from './config.js';
