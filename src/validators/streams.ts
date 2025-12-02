/**
 * Stream Request Validators
 *
 * Zod schemas for live streaming API endpoints.
 */
import { z } from 'zod';
import { videoIdSchema, formatSchema, resolutionSchema } from './common.schemas';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const streamVideoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

export type StreamVideoIdParams = z.infer<typeof streamVideoIdParamsSchema>;

/**
 * Stream segment parameters schema
 */
export const streamSegmentParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  resolution: resolutionSchema,
});

export type StreamSegmentParams = z.infer<typeof streamSegmentParamsSchema>;

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Start stream request body schema
 */
export const streamStartBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  tags: z.string().max(500).optional().default(''),
  rtmpUrl: z.string().url().optional(),
  isRecordingEnabled: z.boolean().optional().default(false),
  isLiveChatEnabled: z.boolean().optional().default(true),
});

export type StreamStartBody = z.infer<typeof streamStartBodySchema>;

/**
 * Chat settings request body schema
 */
export const chatSettingsBodySchema = z.object({
  isChatEnabled: z.boolean().optional(),
  isChatHistoryEnabled: z.boolean().optional(),
  chatSlowModeSeconds: z.number().int().min(0).max(300).optional(),
});

export type ChatSettingsBody = z.infer<typeof chatSettingsBodySchema>;

/**
 * Remove segment request body schema
 */
export const removeSegmentBodySchema = z.object({
  segmentName: z.string().min(1),
});

export type RemoveSegmentBody = z.infer<typeof removeSegmentBodySchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Chat history query parameters schema
 */
export const chatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  before: z.coerce.number().int().min(0).optional(),
});

export type ChatHistoryQuery = z.infer<typeof chatHistoryQuerySchema>;
