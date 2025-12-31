/**
 * Streams Request Schemas
 *
 * Zod schemas for live streaming API endpoints.
 */
import { z } from 'zod';
import {
  videoIdSchema,
  formatSchema,
  resolutionSchema,
  videoIdSchemaOptional,
  titleSchema,
  descriptionSchema,
  tagsSchema,
  portSchema,
} from '@validators/schemas/common.js';

// ============================================================================
// Stream-Specific Schemas
// ============================================================================

/**
 * Network address schema (IP or hostname)
 */
export const networkAddressSchema = z
  .string()
  .min(1, 'Network address is required')
  .max(100, 'Network address must be less than 100 characters');

/**
 * UUID schema
 */
export const uuidSchema = z.union([z.uuid(), z.literal('moartube')]);

/**
 * HLS segment name schema
 */
export const hlsSegmentNameSchema = z
  .string()
  .regex(
    /^segment-(?:2160p|1440p|1080p|720p|480p|360p|240p)-\d+\.ts$/,
    'Invalid segment name format'
  );

/**
 * Chat history limit schema
 */
export const chatHistoryLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(500)
  .optional()
  .default(100);

/**
 * Chat slow mode seconds schema
 */
export const chatSlowModeSecondsSchema = z.number().int().min(0).max(300).optional();

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const streamVideoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

/**
 * Stream segment parameters schema
 */
export const streamSegmentParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  resolution: resolutionSchema,
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Start stream request body schema
 */
export const streamStartBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
  rtmpPort: portSchema,
  uuid: uuidSchema,
  isRecordingStreamRemotely: z.boolean(),
  isRecordingStreamLocally: z.boolean(),
  networkAddress: networkAddressSchema,
  resolution: resolutionSchema,
  videoId: videoIdSchemaOptional,
});

/**
 * Chat settings request body schema
 */
export const chatSettingsBodySchema = z.object({
  isChatEnabled: z.boolean().optional(),
  isChatHistoryEnabled: z.boolean().optional(),
  chatHistoryLimit: chatHistoryLimitSchema,
  chatSlowModeSeconds: chatSlowModeSecondsSchema,
});

/**
 * Remove segment request body schema
 */
export const removeSegmentBodySchema = z.object({
  segmentName: hlsSegmentNameSchema,
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Chat history query parameters schema
 */
export const chatHistoryQuerySchema = z.object({
  limit: chatHistoryLimitSchema,
  before: z.coerce.number().int().min(0).optional(),
});

