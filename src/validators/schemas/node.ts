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
