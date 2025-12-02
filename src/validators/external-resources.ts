/**
 * External Resources Request Validators
 *
 * Zod schemas for static resource serving API endpoints.
 */
import { z } from 'zod';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Filename parameter schema
 */
export const filenameParamsSchema = z.object({
  filename: z.string().min(1).max(255),
});

export type FilenameParams = z.infer<typeof filenameParamsSchema>;

/**
 * Image name parameter schema
 */
export const imageNameParamsSchema = z.object({
  imageName: z.string().min(1).max(255),
});

export type ImageNameParams = z.infer<typeof imageNameParamsSchema>;
