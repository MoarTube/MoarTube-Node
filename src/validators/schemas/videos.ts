/**
 * Video Request Schemas
 *
 * Zod schemas for video-related API endpoints.
 */
import { z } from 'zod';
import {
  videoIdSchema,
  titleSchema,
  descriptionSchema,
  tagsSchema,
  formatSchema,
  resolutionSchema,
  manifestTypeSchema,
  sortTermSchema,
  tagLimitSchema,
  timestampSchema,
  booleanSchema,
  commentIdSchema,
  sortDirectionSchema,
  cloudflareTurnstileTokenSchema,
  reportEmailSchema,
  reportTypeSchema,
  reportMessageSchema,
  searchTermSchemaOptional,
  tagTermSchemaOptional,
} from '@validators/schemas/common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const videoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

/**
 * Video comment ID parameters schema
 */
export const videoCommentIdParamsSchema = z.object({
  videoId: videoIdSchema,
  commentId: commentIdSchema,
});

/**
 * Video adaptive manifest parameters schema
 */
export const videoAdaptiveManifestParamsSchema = z.object({
  videoId: videoIdSchema,
  manifestType: manifestTypeSchema,
});

export type VideoAdaptiveManifestParams = z.infer<typeof videoAdaptiveManifestParamsSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

/**
 * Video search query parameters schema
 */
export const videoSearchQuerySchema = z.object({
  searchTerm: searchTermSchemaOptional,
  sortTerm: sortTermSchema,
  tagTerm: tagTermSchemaOptional,
  tagLimit: tagLimitSchema,
  timestamp: timestampSchema,
});

/**
 * Video comments query parameters schema
 */
const commentCacheKey = {
  epoch: z.uuid().optional(),
  revision: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
};

export const videoCommentStateQuerySchema = z.object({ fresh: z.literal('1').optional() });
export const videoCommentQuerySchema = z.object(commentCacheKey);

export const videoCommentCacheQuerySchema = z.object({
  ...commentCacheKey,
  since: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const videoCommentsQuerySchema = z.object({
  ...commentCacheKey,
  knownIds: z
    .string()
    .max(1699)
    .regex(/^\d+(,\d+){0,99}$/)
    .refine((text) =>
      text.split(',').every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)
    )
    .optional(),
  includeTotal: z.literal('1').optional(),
  afterId: z.coerce.number().int().min(0).optional(),
  beforeId: z.coerce.number().int().min(0).optional(),
  type: z.enum(['before', 'after']),
  sort: sortDirectionSchema,
  timestamp: timestampSchema,
});

/**
 * Video comment delete query parameters schema
 */
export const videoCommentRepliesQuerySchema = z.object({
  ...commentCacheKey,
  beforeReplyId: commentIdSchema.optional(),
});

export const videoCommentDeleteQuerySchema = z.object({
  timestamp: timestampSchema,
});

/**
 * Video upload query parameters schema
 */
export const videoUploadQuerySchema = z.object({
  format: formatSchema,
  resolution: resolutionSchema,
});

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Video import request body schema
 */
export const videoImportBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
});

/**
 * Video ID body schema (for endpoints accepting videoId in body)
 */
export const videoIdBodySchema = z.object({
  videoId: videoIdSchema,
});

/**
 * Video data update request body schema
 */
export const videoDataBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
});

/**
 * Video unpublish request body schema
 */
export const videoUnpublishBodySchema = z.object({
  format: formatSchema,
  resolution: resolutionSchema,
});

/**
 * Video source file extension request body schema
 */
export const videoSourceFileExtensionBodySchema = z.object({
  sourceFileExtension: z.string().max(10, 'Source file extension must be less than 10 characters'),
});

/**
 * Video lengths request body schema
 */
export const videoLengthsBodySchema = z.object({
  lengthSeconds: z.coerce.number().min(0).transform(Math.floor),
  lengthTimestamp: z.string(),
});

/**
 * Video delete request body schema
 */
export const videoDeleteBodySchema = z.object({
  videoIds: z.array(videoIdSchema).min(1),
});

/**
 * Video finalize request body schema
 */
export const videoFinalizeBodySchema = z.object({
  videoIds: z.array(videoIdSchema).min(1),
});

/**
 * Video comment create request body schema
 */
export const videoCommentBodySchema = z.object({
  commentPlainText: z
    .string()
    .min(1, 'Comment is required')
    .max(2000, 'Comment must be less than 2000 characters'),
  timestamp: timestampSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

/**
 * Video like/dislike request body schema
 */
export const videoLikeDislikeBodySchema = z.object({
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

/**
 * Video report request body schema
 */
export const videoReportBodySchema = z.object({
  email: reportEmailSchema,
  reportType: reportTypeSchema,
  message: reportMessageSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

/**
 * Video permissions request body schema
 */
export const videoPermissionsBodySchema = z.object({
  type: z.enum(['comments', 'likes', 'dislikes', 'reports', 'livechat']),
  isEnabled: booleanSchema,
});

/**
 * Video master manifest request body schema
 */
export const videoMasterManifestBodySchema = z.object({
  masterManifest: z.string().min(1, 'Master manifest content is required'),
});
export type VideoMasterManifestBody = z.infer<typeof videoMasterManifestBodySchema>;
