/**
 * Settings Request Validators
 *
 * Zod schemas for node settings API endpoints.
 */
import { z } from 'zod';
import { protocolSchema, addressSchema, portSchema, booleanSchema } from './common.schemas';

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Node name personalization request body schema
 */
export const personalizeNodeNameBodySchema = z.object({
  nodeName: z.string().min(1, 'Node name is required').max(100),
});

export type PersonalizeNodeNameBody = z.infer<typeof personalizeNodeNameBodySchema>;

/**
 * Node about personalization request body schema
 */
export const personalizeNodeAboutBodySchema = z.object({
  nodeAbout: z.string().max(5000).optional().default(''),
});

export type PersonalizeNodeAboutBody = z.infer<typeof personalizeNodeAboutBodySchema>;

/**
 * Node ID personalization request body schema
 */
export const personalizeNodeIdBodySchema = z.object({
  nodeId: z.string().min(1).max(100),
});

export type PersonalizeNodeIdBody = z.infer<typeof personalizeNodeIdBodySchema>;

/**
 * Secure mode configuration request body schema
 */
export const configureSecureBodySchema = z.object({
  isSecure: booleanSchema,
  keyFile: z.string().optional(),
  certFile: z.string().optional(),
  caFiles: z.array(z.string()).optional(),
});

export type ConfigureSecureBody = z.infer<typeof configureSecureBodySchema>;

/**
 * Account update request body schema
 */
export const updateAccountBodySchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
});

export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;

/**
 * Internal network configuration request body schema
 */
export const networkInternalBodySchema = z.object({
  nodeListeningPort: portSchema,
});

export type NetworkInternalBody = z.infer<typeof networkInternalBodySchema>;

/**
 * External network configuration request body schema
 */
export const networkExternalBodySchema = z.object({
  publicNodeProtocol: protocolSchema,
  publicNodeAddress: addressSchema,
  publicNodePort: portSchema,
});

export type NetworkExternalBody = z.infer<typeof networkExternalBodySchema>;

/**
 * Cloudflare configuration request body schema
 */
export const cloudflareConfigureBodySchema = z.object({
  cloudflareEmailAddress: z.string().email(),
  cloudflareZoneId: z.string().min(1),
  cloudflareGlobalApiKey: z.string().min(1),
});

export type CloudflareConfigureBody = z.infer<typeof cloudflareConfigureBodySchema>;

/**
 * Cloudflare Turnstile configuration request body schema
 */
export const cloudflareTurnstileConfigureBodySchema = z.object({
  cloudflareTurnstileSiteKey: z.string().min(1),
  cloudflareTurnstileSecretKey: z.string().min(1),
});

export type CloudflareTurnstileConfigureBody = z.infer<
  typeof cloudflareTurnstileConfigureBodySchema
>;

/**
 * Feature toggle request body schema (for comments, likes, dislikes, reports, live chat)
 */
export const featureToggleBodySchema = z.object({
  isEnabled: booleanSchema,
});

export type FeatureToggleBody = z.infer<typeof featureToggleBodySchema>;

/**
 * Database configuration toggle request body schema
 */
export const databaseConfigToggleBodySchema = z.object({
  databaseDialect: z.enum(['sqlite', 'postgres']),
  postgresHost: z.string().optional(),
  postgresPort: portSchema.optional(),
  postgresDatabase: z.string().optional(),
  postgresUser: z.string().optional(),
  postgresPassword: z.string().optional(),
});

export type DatabaseConfigToggleBody = z.infer<typeof databaseConfigToggleBodySchema>;

/**
 * Storage configuration toggle request body schema
 */
export const storageConfigToggleBodySchema = z.object({
  storageMode: z.enum(['filesystem', 's3']),
  s3Endpoint: z.string().url().optional(),
  s3Region: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretAccessKey: z.string().optional(),
});

export type StorageConfigToggleBody = z.infer<typeof storageConfigToggleBodySchema>;
