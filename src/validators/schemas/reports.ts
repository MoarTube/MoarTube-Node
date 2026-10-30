/**
 * Reports Request Schemas
 *
 * Zod schemas for report management API endpoints.
 */
import { z } from 'zod';
import { timestampSchema, idSchema } from '@validators/schemas/common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Report ID parameter schema
 */
export const reportIdParamsSchema = z.object({
  reportId: idSchema,
});

/**
 * Archive ID parameter schema
 */
export const archiveIdParamsSchema = z.object({
  archiveId: idSchema,
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Reports list query parameters schema
 */
export const reportsQuerySchema = z.object({
  timestamp: timestampSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(101).optional(),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Archive report request body schema
 */
export const archiveReportBodySchema = z.object({
  reportId: idSchema,
});
