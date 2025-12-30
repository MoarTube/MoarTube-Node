/**
 * Links Request Schemas
 *
 * Zod schemas for social link API endpoints.
 */
import { z } from 'zod';
import { idSchema } from '@validators/schemas/common.js';

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * SVG graphic schema for social links
 */
export const svgGraphicSchema = z
  .string()
  .max(50000, 'SVG graphic must be less than 50000 characters')
  .optional()
  .default('');

/**
 * Add link request body schema
 */
export const addLinkBodySchema = z.object({
  url: z.url().max(2048),
  svgGraphic: svgGraphicSchema,
});

export type AddLinkBody = z.infer<typeof addLinkBodySchema>;

/**
 * Delete link request body schema
 */
export const deleteLinkBodySchema = z.object({
  linkId: idSchema,
});

export type DeleteLinkBody = z.infer<typeof deleteLinkBodySchema>;
