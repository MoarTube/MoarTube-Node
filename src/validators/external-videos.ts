/**
 * External Videos Request Validators
 *
 * Zod schemas for external video serving API endpoints.
 */
import { z } from 'zod';
import {
  videoIdSchema,
  formatSchema,
  resolutionSchema,
  manifestTypeSchema,
} from './common.schemas.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const externalVideoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

export type ExternalVideoIdParams = z.infer<typeof externalVideoIdParamsSchema>;

/**
 * Adaptive manifest parameters schema
 */
export const adaptiveManifestParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  type: manifestTypeSchema,
  manifestName: z.string().min(1),
});

export type AdaptiveManifestParams = z.infer<typeof adaptiveManifestParamsSchema>;

/**
 * Adaptive segment parameters schema
 */
export const adaptiveSegmentParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  resolution: resolutionSchema,
  segmentName: z.string().min(1),
});

export type AdaptiveSegmentParams = z.infer<typeof adaptiveSegmentParamsSchema>;

/**
 * Progressive video parameters schema
 */
export const progressiveVideoParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  progressiveFilename: z.string().min(1),
});

export type ProgressiveVideoParams = z.infer<typeof progressiveVideoParamsSchema>;
