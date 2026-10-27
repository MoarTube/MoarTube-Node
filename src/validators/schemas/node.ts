/**
 * Node Request Schemas
 *
 * Zod schemas for node page API endpoints.
 */
import { z } from 'zod';
import {
  searchTermSchemaOptional,
  sortTermSchema,
  tagTermSchemaOptional,
} from '@validators/schemas/common.js';

// ============================================================================
// Node-Specific Schemas
// ============================================================================

/**
 * Content type schema for moderation
 */
export const contentTypeSchema = z.enum(['comments', 'videoReports', 'commentReports']);

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Node search query parameters schema
 */
export const nodeSearchQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000_000).optional().default(0),
  searchTerm: searchTermSchemaOptional,
  sortTerm: sortTermSchema,
  tagTerm: tagTermSchemaOptional,
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Content checked request body schema
 */
export const contentCheckedBodySchema = z.object({
  contentType: contentTypeSchema,
});
