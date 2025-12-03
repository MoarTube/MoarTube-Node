/**
 * Watch Request Validators
 *
 * Zod schemas for watch page API endpoints.
 */
import { z } from 'zod';
import { videoIdSchema } from './common.schemas.js';

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Watch page query parameters schema
 */
export const watchQuerySchema = z.object({
  v: videoIdSchema.optional(),
});

export type WatchQuery = z.infer<typeof watchQuerySchema>;

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Watch embed video ID parameter schema
 */
export const watchEmbedVideoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

export type WatchEmbedVideoIdParams = z.infer<typeof watchEmbedVideoIdParamsSchema>;
