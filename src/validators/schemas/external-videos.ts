/**
 * External Videos Request Schemas
 *
 * Zod schemas for external video serving API endpoints.
 */
import { z } from 'zod';
import { videoIdSchema, formatSchema, resolutionSchema, manifestTypeSchema } from '@validators/schemas/common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const externalVideoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

/**
 * Adaptive manifest parameters schema
 */
export const adaptiveManifestParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  type: manifestTypeSchema,
  manifestName: z.string().min(1),
});

/**
 * Adaptive segment parameters schema
 */
export const adaptiveSegmentParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  resolution: resolutionSchema,
  segmentName: z.string().min(1),
});

/**
 * Progressive video parameters schema
 */
export const progressiveVideoParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  progressiveFilename: z.string().min(1),
});
