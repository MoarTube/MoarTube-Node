/**
 * Common Zod Schemas
 *
 * Reusable validation schemas for common field types across the application.
 */
import { z } from 'zod';

// ============================================================================
// Basic Types
// ============================================================================

/**
 * Video ID schema - 11 character alphanumeric with - and _
 */
export const videoIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid video ID format');
export const videoIdSchemaOptional = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid video ID format')
  .optional();

/**
 * Comment ID schema - positive integer
 */
export const commentIdSchema = z.coerce.number().int().positive();

/**
 * Generic ID schema - positive integer for any entity ID
 */
export const idSchema = z.coerce.number().int().positive();

/**
 * Timestamp schema - Unix timestamp in milliseconds
 */
export const timestampSchema = z.coerce.number().int().min(0).max(32503680000000); // Up to year 3000

/**
 * Boolean coercion schema - handles string "true"/"false" values
 */
export const booleanSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((val) => val === true || val === 'true');

/**
 * Optional boolean schema
 */
export const optionalBooleanSchema = booleanSchema.optional();

/**
 * Filename schema
 */
export const filenameSchema = z.string().min(1).max(255);

// ============================================================================
// Email Schemas
// ============================================================================

/**
 * Email schema
 */

// ============================================================================
// Video Schemas
// ============================================================================

/**
 * Video title schema
 */
export const titleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(200, 'Title must be less than 200 characters');

/**
 * Video description schema
 */
export const descriptionSchema = z
  .string()
  .max(5000, 'Description must be less than 5000 characters')
  .optional()
  .default('');

/**
 * Video tags schema (comma-separated)
 */
export const tagsSchema = z
  .string()
  .max(500, 'Tags must be less than 500 characters')
  .optional()
  .default('');

/**
 * Video format schema
 */
export const formatSchema = z.enum(['m3u8', 'mp4', 'webm', 'ogv']);

/**
 * Video resolution schema
 */
export const resolutionSchema = z.enum(['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p']);

/**
 * Manifest type schema (for HLS streaming)
 */
export const manifestTypeSchema = z.enum(['static', 'dynamic']);

// ============================================================================
// Search & Pagination Schemas
// ============================================================================

/**
 * Search term schema
 */
export const searchTermSchema = z.string().max(100);
export const searchTermSchemaOptional = z.string().max(100).optional();

/**
 * Sort term schema for video listings
 */
export const sortTermSchema = z.enum(['latest', 'popular', 'oldest']).optional().default('latest');

/**
 * Tag term schema for filtering
 */
export const tagTermSchema = z.string().max(100);
export const tagTermSchemaOptional = z.string().max(100).optional();

/**
 * Tag limit schema
 */
export const tagLimitSchema = z.coerce.number().int().min(0);

/**
 * Sort direction schema
 */
export const sortDirectionSchema = z.enum(['ascending', 'descending']);

// ============================================================================
// Account Schemas
// ============================================================================

/**
 * Username schema
 */
export const usernameSchema = z
  .string()
  .min(1, 'Username is required')
  .max(100, 'Username must be less than 100 characters');

/**
 * Password schema
 */
export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(256, 'Password must be less than 256 characters');

// ============================================================================
// Network Schemas
// ============================================================================

/**
 * Protocol schema
 */
export const protocolSchema = z.enum(['http', 'https']);

/**
 * IP address or domain schema
 */
export const addressSchema = z
  .string()
  .min(1, 'Address is required')
  .max(253, 'Address must be less than 253 characters');

/**
 * Port schema
 */
export const portSchema = z.coerce.number().int().min(1).max(65535);

// ============================================================================
// Report Schemas
// ============================================================================

/**
 * Report email schema
 */
export const reportEmailSchema = z
  .email('Invalid email format')
  .max(320, 'Email must be less than 320 characters');

/**
 * Report type schema
 */
export const reportTypeSchema = z.enum([
  'spam',
  'harassment',
  'copyright',
  'inappropriate',
  'violence',
  'misinformation',
  'other',
]);

/**
 * Report message schema
 */
export const reportMessageSchema = z
  .string()
  .max(2000, 'Message must be less than 2000 characters')
  .optional()
  .default('');

// ============================================================================
// Comment Schemas
// ============================================================================

// ============================================================================
// Cloudflare Schemas
// ============================================================================

/**
 * Cloudflare Turnstile token schema (optional - can be empty if turnstile not enabled)
 */
export const cloudflareTurnstileTokenSchema = z.string().optional().default('');

// ============================================================================
// Video Permission Schemas
// ============================================================================
