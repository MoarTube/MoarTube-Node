/**
 * External Resources Request Schemas
 *
 * Zod schemas for static resource serving API endpoints.
 */
import { z } from 'zod';
import { filenameSchema } from '@validators/schemas/common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Filename parameter schema
 */
export const filenameParamsSchema = z.object({
  filename: filenameSchema,
});

/**
 * Image name parameter schema
 */
export const imageNameParamsSchema = z.object({
  imageName: filenameSchema,
});
