/**
 * Configuration type definitions
 * Complete type definitions for all configuration structures used in MoarTube-Node
 */

// ============================================
// Database Configuration
// ============================================

/**
 * PostgreSQL database configuration
 */
export interface PostgresConfig {
  databaseName: string;
  username: string;
  password: string;
  host: string;
  port: number;
}

/**
 * Database configuration supporting SQLite and PostgreSQL
 */
export interface DatabaseConfig {
  databaseDialect: 'sqlite' | 'postgres';
  postgresConfig?: PostgresConfig;
}

// ============================================
// S3 Storage Configuration
// ============================================

/**
 * AWS/S3 provider credentials
 */
export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3 provider client configuration
 */
export interface S3ProviderClientConfig {
  forcePathStyle: boolean;
  region: string;
  credentials: S3Credentials;
  endpoint?: string;
}

/**
 * S3 storage configuration
 */
export interface S3Config {
  bucketName: string;
  s3ProviderClientConfig: S3ProviderClientConfig;
}

/**
 * Storage configuration supporting filesystem and S3 modes
 */
export interface StorageConfig {
  storageMode: 'filesystem' | 's3provider';
  s3Config?: S3Config;
}

// ============================================
// Cloudflare Configuration
// ============================================

/**
 * Cloudflare CDN and Turnstile configuration
 */
export interface CloudflareConfig {
  isCloudflareCdnEnabled: boolean;
  cloudflareEmailAddress: string;
  cloudflareZoneId: string;
  cloudflareGlobalApiKey: string;
  isCloudflareTurnstileEnabled: boolean;
  cloudflareTurnstileSiteKey: string;
  cloudflareTurnstileSecretKey: string;
}

// ============================================
// Node Settings (Main Configuration)
// ============================================

/**
 * Complete node settings stored in _node_settings.json
 */
export interface NodeSettings {
  // Server Configuration
  nodeListeningPort: number | string;
  isSecure: boolean;
  publicNodeProtocol: 'http' | 'https' | '';
  publicNodeAddress: string;
  publicNodePort: number | string;

  // Node Identity
  nodeName: string;
  nodeAbout: string;
  nodeId: string;

  // Authentication (Base64 encoded bcrypt hashes)
  username: string;
  password: string;
  expressSessionName: string;
  expressSessionSecret: string;

  // Cloudflare Settings
  isCloudflareCdnEnabled: boolean;
  cloudflareEmailAddress: string;
  cloudflareZoneId: string;
  cloudflareGlobalApiKey: string;
  isCloudflareTurnstileEnabled: boolean;
  cloudflareTurnstileSiteKey: string;
  cloudflareTurnstileSecretKey: string;

  // Feature Flags
  isCommentsEnabled: boolean;
  isLikesEnabled: boolean;
  isDislikesEnabled: boolean;
  isReportsEnabled: boolean;
  isLiveChatEnabled: boolean;

  // Database & Storage
  databaseConfig: DatabaseConfig;
  storageConfig: StorageConfig;

  // Optional external videos base URL (used when storage is S3 with Cloudflare)
  externalVideosBaseUrl?: string;
}

// ============================================
// Node Identification
// ============================================

/**
 * Node identification for MoarTube network
 */
export interface NodeIdentification {
  moarTubeTokenProof: string;
}

// ============================================
// Content Tracker
// ============================================

/**
 * Tracks last checked timestamps for new content notifications
 */
export interface LastCheckedContentTracker {
  lastCheckedCommentsTimestamp: number;
  lastCheckedVideoReportsTimestamp: number;
  lastCheckedCommentReportsTimestamp: number;
}

// ============================================
// Application Config (config.json)
// ============================================

/**
 * Indexer service configuration
 */
export interface IndexerConfig {
  httpProtocol: 'http' | 'https';
  host: string;
  port: number;
}

/**
 * Aliaser service configuration
 */
export interface AliaserConfig {
  httpProtocol: 'http' | 'https';
  host: string;
  port: number;
}

/**
 * Main application config (config.json)
 */
export interface AppConfig {
  isDeveloperMode: boolean;
  indexerConfig: IndexerConfig;
  aliaserConfig: AliaserConfig;
}

// ============================================
// Runtime Configuration
// ============================================

/**
 * Runtime configuration (not persisted)
 */
export interface RuntimeConfig {
  jwtSecret: string;
  isDockerEnvironment: boolean;
  isDeveloperMode: boolean;
  expressSessionName: string;
  expressSessionSecret: string;
}

// ============================================
// Path Configuration
// ============================================

/**
 * All directory and file paths used by the application
 */
export interface PathConfig {
  // Base directories
  publicDirectoryPath: string;
  dataDirectoryPath: string;
  viewsDirectoryPath: string;

  // Data subdirectories
  imagesDirectoryPath: string;
  videosDirectoryPath: string;
  databaseDirectoryPath: string;
  certificatesDirectoryPath: string;

  // Config files
  nodeSettingsPath: string;
  lastCheckedContentTrackerPath: string;
  databaseFilePath: string;
}

// ============================================
// Environment Configuration
// ============================================

/**
 * Environment variables configuration
 */
export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  IS_DOCKER_ENVIRONMENT: boolean;
  MOARTUBE_DATA_DIR?: string;
  DATABASE_URL?: string;
  LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  PORT?: number;
  HOST?: string;
}
