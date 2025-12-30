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

export type ReportIdParams = z.infer<typeof reportIdParamsSchema>;

/**
 * Archive ID parameter schema
 */
export const archiveIdParamsSchema = z.object({
  archiveId: idSchema,
});

export type ArchiveIdParams = z.infer<typeof archiveIdParamsSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Reports list query parameters schema
 */
export const reportsQuerySchema = z.object({
  timestamp: timestampSchema.optional(),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Archive report request body schema
 */
export const archiveReportBodySchema = z.object({
  reportId: idSchema,
});

export type ArchiveReportBody = z.infer<typeof archiveReportBodySchema>;
