/**
 * Node Request Validators
 *
 * Zod schemas for node page API endpoints.
 */
import { z } from 'zod';
import {
  searchTermSchema,
  sortTermSchema,
  tagTermSchema,
  tagLimitSchema,
  timestampSchema,
} from './common.schemas.js';

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Node search query parameters schema
 */
export const nodeSearchQuerySchema = z.object({
  searchTerm: searchTermSchema,
  sortTerm: sortTermSchema,
  tagTerm: tagTermSchema,
  tagLimit: tagLimitSchema,
  timestamp: timestampSchema,
});

export type NodeSearchQuery = z.infer<typeof nodeSearchQuerySchema>;

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Content checked request body schema
 */
export const contentCheckedBodySchema = z.object({
  type: z.enum(['videos', 'comments', 'videoReports', 'commentReports']),
});

export type ContentCheckedBody = z.infer<typeof contentCheckedBodySchema>;
