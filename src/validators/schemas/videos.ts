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
} from './common.js';

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/**
 * Video ID parameter schema
 */
export const videoIdParamsSchema = z.object({
  videoId: videoIdSchema,
});

export type VideoIdParams = z.infer<typeof videoIdParamsSchema>;

/**
 * Video format/resolution parameters schema
 */
export const videoFormatResolutionParamsSchema = z.object({
  videoId: videoIdSchema,
  format: formatSchema,
  resolution: resolutionSchema,
});

export type VideoFormatResolutionParams = z.infer<typeof videoFormatResolutionParamsSchema>;

/**
 * Video comment ID parameters schema
 */
export const videoCommentIdParamsSchema = z.object({
  videoId: videoIdSchema,
  commentId: commentIdSchema,
});

export type VideoCommentIdParams = z.infer<typeof videoCommentIdParamsSchema>;

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

export type VideoSearchQuery = z.infer<typeof videoSearchQuerySchema>;

/**
 * Video comments query parameters schema
 */
export const videoCommentsQuerySchema = z.object({
  type: z.enum(['before', 'after']),
  sort: sortDirectionSchema,
  timestamp: timestampSchema,
});

export type VideoCommentsQuery = z.infer<typeof videoCommentsQuerySchema>;

/**
 * Video comment delete query parameters schema
 */
export const videoCommentDeleteQuerySchema = z.object({
  timestamp: timestampSchema,
});

export type VideoCommentDeleteQuery = z.infer<typeof videoCommentDeleteQuerySchema>;

/**
 * Video comment get query parameters schema
 */
export const videoCommentGetQuerySchema = z.object({
  timestamp: timestampSchema,
});

export type VideoCommentGetQuery = z.infer<typeof videoCommentGetQuerySchema>;

/**
 * Video upload query parameters schema
 */
export const videoUploadQuerySchema = z.object({
  format: formatSchema,
  resolution: resolutionSchema,
});

export type VideoUploadQuery = z.infer<typeof videoUploadQuerySchema>;

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

export type VideoImportBody = z.infer<typeof videoImportBodySchema>;

/**
 * Video ID body schema (for endpoints accepting videoId in body)
 */
export const videoIdBodySchema = z.object({
  videoId: videoIdSchema,
});

export type VideoIdBody = z.infer<typeof videoIdBodySchema>;

/**
 * Video data update request body schema
 */
export const videoDataBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
});

export type VideoDataBody = z.infer<typeof videoDataBodySchema>;

/**
 * Video unpublish request body schema
 */
export const videoUnpublishBodySchema = z.object({
  format: formatSchema,
  resolution: resolutionSchema,
});

export type VideoUnpublishBody = z.infer<typeof videoUnpublishBodySchema>;

/**
 * Video source file extension request body schema
 */
export const videoSourceFileExtensionBodySchema = z.object({
  sourceFileExtension: z.string().max(10, 'Source file extension must be less than 10 characters'),
});

export type VideoSourceFileExtensionBody = z.infer<typeof videoSourceFileExtensionBodySchema>;

/**
 * Video index add request body schema
 */
export const videoIndexAddBodySchema = z.object({
  containsAdultContent: booleanSchema,
  termsOfServiceAgreed: booleanSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

export type VideoIndexAddBody = z.infer<typeof videoIndexAddBodySchema>;

/**
 * Video index remove request body schema
 */
export const videoIndexRemoveBodySchema = z.object({
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

export type VideoIndexRemoveBody = z.infer<typeof videoIndexRemoveBodySchema>;

/**
 * Video lengths request body schema
 */
export const videoLengthsBodySchema = z.object({
  lengthSeconds: z.coerce.number().min(0).transform(Math.floor),
  lengthTimestamp: z.string(),
});

export type VideoLengthsBody = z.infer<typeof videoLengthsBodySchema>;

/**
 * Video delete request body schema
 */
export const videoDeleteBodySchema = z.object({
  videoIds: z.array(videoIdSchema).min(1),
});

export type VideoDeleteBody = z.infer<typeof videoDeleteBodySchema>;

/**
 * Video finalize request body schema
 */
export const videoFinalizeBodySchema = z.object({
  videoIds: z.array(videoIdSchema).min(1),
});

export type VideoFinalizeBody = z.infer<typeof videoFinalizeBodySchema>;

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

export type VideoCommentBody = z.infer<typeof videoCommentBodySchema>;

/**
 * Video like/dislike request body schema
 */
export const videoLikeDislikeBodySchema = z.object({
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

export type VideoLikeDislikeBody = z.infer<typeof videoLikeDislikeBodySchema>;

/**
 * Video report request body schema
 */
export const videoReportBodySchema = z.object({
  email: reportEmailSchema,
  reportType: reportTypeSchema,
  message: reportMessageSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

export type VideoReportBody = z.infer<typeof videoReportBodySchema>;

/**
 * Video permissions request body schema
 */
export const videoPermissionsBodySchema = z.object({
  type: z.enum(['comments', 'likes', 'dislikes', 'reports', 'livechat']),
  isEnabled: booleanSchema,
});

export type VideoPermissionsBody = z.infer<typeof videoPermissionsBodySchema>;

/**
 * Video master manifest request body schema
 */
export const videoMasterManifestBodySchema = z.object({
  masterManifest: z.string().min(1, 'Master manifest content is required'),
});

export type VideoMasterManifestBody = z.infer<typeof videoMasterManifestBodySchema>;
