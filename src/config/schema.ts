/**
 * Configuration schema validation module
 * Zod schemas for runtime validation of all configuration structures
 */

import { z } from 'zod';

// ============================================
// Database Configuration Schemas
// ============================================

/**
 * PostgreSQL configuration schema
 */
export const PostgresConfigSchema = z.object({
  databaseName: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string(),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535).default(5432),
});

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z.object({
  databaseDialect: z.enum(['sqlite', 'postgres']),
  postgresConfig: PostgresConfigSchema.optional(),
});

// ============================================
// S3 Storage Configuration Schemas
// ============================================

/**
 * S3 credentials schema
 */
export const S3CredentialsSchema = z.object({
  accessKeyId: z.string().min(1, 'Access key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret access key is required'),
});

/**
 * S3 provider client configuration schema
 */
export const S3ProviderClientConfigSchema = z.object({
  forcePathStyle: z.boolean().default(false),
  region: z.string().min(1, 'Region is required'),
  credentials: S3CredentialsSchema,
  endpoint: z.url().optional(),
});

/**
 * S3 configuration schema
 */
export const S3ConfigSchema = z.object({
  bucketName: z.string().min(1, 'Bucket name is required'),
  s3ProviderClientConfig: S3ProviderClientConfigSchema,
});

/**
 * Storage configuration schema
 */
export const StorageConfigSchema = z.object({
  storageMode: z.enum(['filesystem', 's3provider']),
  s3Config: S3ConfigSchema.optional(),
});

// ============================================
// Node Settings Schema
// ============================================

/**
 * Complete node settings schema with all fields validated
 */
export const NodeSettingsSchema = z.object({
  // Server Configuration
  nodeListeningPort: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      throw new Error('Port must be between 1 and 65535');
    }
    return num;
  }),
  isSecure: z.boolean().default(false),
  publicNodeProtocol: z.enum(['http', 'https', '']).default(''),
  publicNodeAddress: z.string().default(''),
  publicNodePort: z.union([z.number(), z.string()]).default(''),

  // Node Identity
  nodeName: z.string().default('MoarTube Node'),
  nodeAbout: z.string().default('A MoarTube Node'),
  nodeId: z.string().default(''), // May be empty initially, generated on first startup

  // Authentication (Base64 encoded bcrypt hashes)
  username: z.string().min(1, 'Username hash is required'),
  password: z.string().min(1, 'Password hash is required'),

  // Cloudflare Settings
  isCloudflareCdnEnabled: z.boolean().default(false),
  cloudflareEmailAddress: z.string().default(''),
  cloudflareZoneId: z.string().default(''),
  cloudflareGlobalApiKey: z.string().default(''),
  isCloudflareTurnstileEnabled: z.boolean().default(false),
  cloudflareTurnstileSiteKey: z.string().default(''),
  cloudflareTurnstileSecretKey: z.string().default(''),

  // Feature Flags
  isCommentsEnabled: z.boolean().default(true),
  isLikesEnabled: z.boolean().default(true),
  isDislikesEnabled: z.boolean().default(true),
  isReportsEnabled: z.boolean().default(true),
  isLiveChatEnabled: z.boolean().default(true),

  // Database & Storage
  databaseConfig: DatabaseConfigSchema,
  storageConfig: StorageConfigSchema,

  // Optional external videos base URL
  externalVideosBaseUrl: z.string().optional(),
});

// ============================================
// App Config Schemas
// ============================================

/**
 * Indexer service configuration schema
 */
export const IndexerConfigSchema = z.object({
  httpProtocol: z.enum(['http', 'https']),
  host: z.string().min(1, 'Indexer host is required'),
  port: z.number().int().min(1).max(65535),
});

/**
 * Aliaser service configuration schema
 */
export const AliaserConfigSchema = z.object({
  httpProtocol: z.enum(['http', 'https']),
  host: z.string().min(1, 'Aliaser host is required'),
  port: z.number().int().min(1).max(65535),
});

/**
 * Main application config schema (config.json)
 */
export const AppConfigSchema = z.object({
  isDeveloperMode: z.boolean().default(false),
  indexerConfig: IndexerConfigSchema,
  aliaserConfig: AliaserConfigSchema,
});

// ============================================
// Node Identification Schema
// ============================================

/**
 * Node identification schema
 */
export const NodeIdentificationSchema = z.object({
  moarTubeTokenProof: z.string(),
});

// ============================================
// Last Checked Content Tracker Schema
// ============================================

/**
 * Content tracker schema
 */
export const LastCheckedContentTrackerSchema = z.object({
  lastCheckedCommentsTimestamp: z.number().default(0),
  lastCheckedVideoReportsTimestamp: z.number().default(0),
  lastCheckedCommentReportsTimestamp: z.number().default(0),
});

// ============================================
// Inferred Types (for runtime use)
// ============================================

export type NodeSettingsValidated = z.infer<typeof NodeSettingsSchema>;
export type AppConfigValidated = z.infer<typeof AppConfigSchema>;
export type NodeIdentificationValidated = z.infer<typeof NodeIdentificationSchema>;
export type LastCheckedContentTrackerValidated = z.infer<typeof LastCheckedContentTrackerSchema>;

// ============================================
// Validation Helper Functions
// ============================================

/**
 * Validate node settings with detailed error messages
 */
export function validateNodeSettings(data: unknown): NodeSettingsValidated {
  const result = NodeSettingsSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid node settings: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate app config with detailed error messages
 */
export function validateAppConfig(data: unknown): AppConfigValidated {
  const result = AppConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid app config: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate node identification
 */
export function validateNodeIdentification(data: unknown): NodeIdentificationValidated {
  const result = NodeIdentificationSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid node identification: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate last checked content tracker
 */
export function validateLastCheckedContentTracker(
  data: unknown
): LastCheckedContentTrackerValidated {
  const result = LastCheckedContentTrackerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid content tracker: ${result.error.message}`);
  }
  return result.data;
}


