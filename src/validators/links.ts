/**
 * Links Request Validators
 *
 * Zod schemas for social link API endpoints.
 */
import { z } from 'zod';

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Add link request body schema
 */
export const addLinkBodySchema = z.object({
  url: z.string().url('Invalid URL format').max(2048),
  svgGraphic: z.string().max(50000).optional().default(''),
});

export type AddLinkBody = z.infer<typeof addLinkBodySchema>;

/**
 * Delete link request body schema
 */
export const deleteLinkBodySchema = z.object({
  linkId: z.coerce.number().int().positive(),
});

export type DeleteLinkBody = z.infer<typeof deleteLinkBodySchema>;
