/**
 * Comments Request Validators
 *
 * Zod schemas for comment API endpoints.
 */
import { z } from 'zod';
import {
  searchTermSchema,
  sortTermSchema,
  tagTermSchema,
  timestampSchema,
  reportEmailSchema,
  reportTypeSchema,
  reportMessageSchema,
  cloudflareTurnstileTokenSchema,
} from './common.schemas';

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
  searchTerm: searchTermSchema,
  sortTerm: sortTermSchema,
  tagTerm: tagTermSchema,
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
