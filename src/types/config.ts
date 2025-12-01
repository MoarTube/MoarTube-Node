/**
 * Configuration type definitions
 * These types will be fully implemented in Phase 1
 */

export interface NodeSettings {
  // Placeholder - will be fully defined in Phase 1
  nodeListeningPort: number;
  isSecure: boolean;
  publicNodeProtocol: 'http' | 'https';
  publicNodeAddress: string;
  publicNodePort: string;
  nodeName: string;
  nodeAbout: string;
  nodeId: string;
}

export interface DatabaseConfig {
  databaseDialect: 'sqlite' | 'postgres';
}

export interface StorageConfig {
  storageMode: 'filesystem' | 's3provider';
}
