/**
 * Settings Request Schemas
 *
 * Zod schemas for node settings API endpoints.
 */
import { z } from 'zod';
import {
  protocolSchema,
  addressSchema,
  portSchema,
  booleanSchema,
  usernameSchema,
  passwordSchema,
} from '@validators/schemas/common.js';

// ============================================================================
// Settings-Specific Schemas
// ============================================================================

/**
 * Node name schema
 */
export const nodeNameSchema = z
  .string()
  .min(1, 'Node name is required')
  .max(100, 'Node name must be less than 100 characters');

/**
 * Node about schema
 */
export const nodeAboutSchema = z
  .string()
  .max(5000, 'Node about must be less than 5000 characters')
  .optional()
  .default('');

/**
 * Node ID schema
 */
export const nodeIdSchema = z
  .string()
  .min(1, 'Node ID is required')
  .max(100, 'Node ID must be less than 100 characters');

/**
 * Database dialect schema
 */
export const databaseDialectSchema = z.enum(['sqlite', 'postgres']);

/**
 * Storage mode schema
 */
export const storageModeSchema = z.enum(['filesystem', 's3provider']);

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Node name personalization request body schema
 */
export const personalizeNodeNameBodySchema = z.object({
  nodeName: nodeNameSchema,
});

/**
 * Node about personalization request body schema
 */
export const personalizeNodeAboutBodySchema = z.object({
  nodeAbout: nodeAboutSchema,
});

/**
 * Node ID personalization request body schema
 */
export const personalizeNodeIdBodySchema = z.object({
  nodeId: nodeIdSchema,
});

/**
 * Account update request body schema
 */
export const updateAccountBodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

/**
 * Internal network configuration request body schema
 */
export const networkInternalBodySchema = z.object({
  nodeListeningPort: portSchema,
});

/**
 * External network configuration request body schema
 */
export const networkExternalBodySchema = z.object({
  publicNodeProtocol: protocolSchema,
  publicNodeAddress: addressSchema,
  publicNodePort: portSchema,
});

/**
 * Cloudflare configuration request body schema
 */
export const cloudflareConfigureBodySchema = z.object({
  cloudflareEmailAddress: z
    .email('Invalid email format')
    .max(320, 'Email must be less than 320 characters'),
  cloudflareZoneId: z.string().min(1),
  cloudflareGlobalApiKey: z.string().min(1),
});

/**
 * Cloudflare Turnstile configuration request body schema
 */
export const cloudflareTurnstileConfigureBodySchema = z.object({
  cloudflareTurnstileSiteKey: z.string().min(1),
  cloudflareTurnstileSecretKey: z.string().min(1),
});

/**
 * Feature toggle request body schema (for comments, likes, dislikes, reports, live chat)
 */
export const featureToggleBodySchema = z.object({
  isEnabled: booleanSchema,
});

/**
 * Secure toggle request body schema (for secure http/https mode)
 */
export const secureToggleQuerySchema = z.object({
  isSecure: booleanSchema,
});

/**
 * Database configuration toggle request body schema
 */
export const databaseConfigToggleBodySchema = z.object({
  databaseConfig: z.object({
    databaseDialect: databaseDialectSchema,
    postgresConfig: z
      .object({
        databaseName: z.string().min(1, 'Database name is required'),
        username: z.string().min(1, 'Username is required'),
        password: z.string().min(1, 'Password is required'),
        host: z.string().min(1, 'Host is required'),
        port: portSchema,
      })
      .optional(),
  }),
});

/**
 * Storage configuration toggle request body schema
 */
export const storageConfigToggleBodySchema = z.object({
  storageConfig: z.object({
    storageMode: storageModeSchema,
    s3Config: z
      .object({
        bucketName: z.string().min(1, 'Bucket name is required'),
        s3ProviderClientConfig: z.object({
          forcePathStyle: z.boolean(),
          region: z.string().min(1, 'Region is required'),
          credentials: z.object({
            accessKeyId: z.string().min(1, 'Access key ID is required'),
            secretAccessKey: z.string().min(1, 'Secret access key is required'),
          }),
        }),
      })
      .optional(),
  }),
});
