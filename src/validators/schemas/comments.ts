/**
 * Comments Request Schemas
 *
 * Zod schemas for comment API endpoints.
 */
import { z } from 'zod';
import {
  timestampSchema,
  reportEmailSchema,
  reportTypeSchema,
  reportMessageSchema,
  cloudflareTurnstileTokenSchema,
  sortDirectionSchema,
  videoIdSchemaOptional,
  searchTermSchemaOptional,
  videoIdSchema,
  commentIdSchema,
} from '@validators/schemas/common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Comment ID parameter schema
 */
export const commentIdParamsSchema = z.object({
  commentId: commentIdSchema,
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Comment search query parameters schema
 */
export const commentSearchQuerySchema = z.object({
  videoId: videoIdSchemaOptional,
  searchTerm: searchTermSchemaOptional,
  limit: z.coerce.number().int().min(0).optional().default(0),
  sortDirection: sortDirectionSchema,
  timestamp: timestampSchema,
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Comment report request body schema
 */
export const commentReportBodySchema = z.object({
  videoId: videoIdSchema,
  timestamp: timestampSchema,
  email: reportEmailSchema,
  reportType: reportTypeSchema,
  message: reportMessageSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});
