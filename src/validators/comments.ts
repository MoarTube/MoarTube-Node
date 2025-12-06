/**
 * Comments Request Validators
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
  limitSchema,
  videoIdSchemaOptional,
  searchTermSchemaOptional,
} from './common.schemas.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Comment ID parameter schema
 */
export const commentIdParamsSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export type CommentIdParams = z.infer<typeof commentIdParamsSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Comment search query parameters schema
 */
export const commentSearchQuerySchema = z.object({
  videoId: videoIdSchemaOptional,
  searchTerm: searchTermSchemaOptional,
  limit: limitSchema,
  sortDirection: sortDirectionSchema,
  timestamp: timestampSchema,
});

export type CommentSearchQuery = z.infer<typeof commentSearchQuerySchema>;

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Comment report request body schema
 */
export const commentReportBodySchema = z.object({
  email: reportEmailSchema,
  reportType: reportTypeSchema,
  message: reportMessageSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

export type CommentReportBody = z.infer<typeof commentReportBodySchema>;
