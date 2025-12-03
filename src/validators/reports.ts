/**
 * Reports Request Validators
 *
 * Zod schemas for report management API endpoints.
 */
import { z } from 'zod';
import { timestampSchema } from './common.schemas.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Report ID parameter schema
 */
export const reportIdParamsSchema = z.object({
  reportId: z.coerce.number().int().positive(),
});

export type ReportIdParams = z.infer<typeof reportIdParamsSchema>;

/**
 * Archive ID parameter schema
 */
export const archiveIdParamsSchema = z.object({
  archiveId: z.coerce.number().int().positive(),
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
  reportId: z.coerce.number().int().positive(),
});

export type ArchiveReportBody = z.infer<typeof archiveReportBodySchema>;
