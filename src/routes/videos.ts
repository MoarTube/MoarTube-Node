/**
 * Videos Routes
 *
 * Routes for video-related endpoints.
 */
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { VideosController } from '../controllers';

/**
 * Register videos routes
 *
 * @param fastify - Fastify instance
 */
export async function videosRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart plugin for file uploads (no limits - user decides what to upload)
  await fastify.register(multipart);

  const controller = new VideosController();

  // ============================================================================
  // Public Endpoints
  // ============================================================================

  // Search videos
  fastify.get(
    '/search',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.searchVideos.bind(controller)
  );

  // Get recommended videos
  fastify.get(
    '/recommended',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getRecommended.bind(controller)
  );

  // Get tags from published videos
  fastify.get(
    '/tags',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getTags.bind(controller)
  );

  // Get tags from all videos
  fastify.get(
    '/tags/all',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAllTags.bind(controller)
  );

  // Get comments
  fastify.get(
    '/:videoId/comments',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getComments.bind(controller)
  );

  // Get single comment by ID
  fastify.get(
    '/:videoId/comments/:commentId',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getComment.bind(controller)
  );

  // Get video alias URL
  fastify.get(
    '/:videoId/alias',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAlias.bind(controller)
  );

  // Get video watch data (for media player)
  fastify.get(
    '/:videoId/watch',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getWatchData.bind(controller)
  );

  // Get video permissions
  fastify.get(
    '/:videoId/permissions',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getVideoPermissions.bind(controller)
  );

  // Get video data with formatted fields
  fastify.get(
    '/:videoId/data',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getVideoData.bind(controller)
  );

  // Get all videos data
  fastify.get(
    '/:videoId/data/all',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAllVideosData.bind(controller)
  );

  // Increment views
  fastify.get(
    '/:videoId/views/increment',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.incrementViews.bind(controller)
  );

  // Like video
  fastify.post(
    '/:videoId/like',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.likeVideo.bind(controller)
  );

  // Dislike video
  fastify.post(
    '/:videoId/dislike',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.dislikeVideo.bind(controller)
  );

  // Add comment
  fastify.post(
    '/:videoId/comments/comment',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.addComment.bind(controller)
  );

  // Report video
  fastify.post(
    '/:videoId/report',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.reportVideo.bind(controller)
  );

  // ============================================================================
  // Protected Endpoints (authentication required)
  // ============================================================================

  // Batch delete videos (must come before /:videoId routes)
  fastify.post(
    '/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.batchDelete.bind(controller)
  );

  // Batch finalize videos (must come before /:videoId routes)
  fastify.post(
    '/finalize',
    {
      preHandler: fastify.authenticate,
    },
    controller.batchFinalize.bind(controller)
  );

  // Import video
  fastify.post(
    '/import',
    {
      preHandler: fastify.authenticate,
    },
    controller.importVideo.bind(controller)
  );

  // Mark video as imported (videoId from body)
  fastify.post(
    '/imported',
    {
      preHandler: fastify.authenticate,
    },
    controller.videoImportedFromBody.bind(controller)
  );

  // Start publishing (videoId from body)
  fastify.post(
    '/publishing',
    {
      preHandler: fastify.authenticate,
    },
    controller.startPublishingFromBody.bind(controller)
  );

  // Mark as published (videoId from body)
  fastify.post(
    '/published',
    {
      preHandler: fastify.authenticate,
    },
    controller.videoPublishedFromBody.bind(controller)
  );

  // Set error state (videoId from body)
  fastify.post(
    '/error',
    {
      preHandler: fastify.authenticate,
    },
    controller.setErrorFromBody.bind(controller)
  );

  // Update video
  fastify.post(
    '/:videoId/data',
    {
      preHandler: fastify.authenticate,
    },
    controller.updateVideo.bind(controller)
  );

  // Update video length
  fastify.post(
    '/:videoId/lengths',
    {
      preHandler: fastify.authenticate,
    },
    controller.setVideoLengths.bind(controller)
  );

  // Mark video index as outdated
  fastify.post(
    '/:videoId/index/outdated',
    {
      preHandler: fastify.authenticate,
    },
    controller.markIndexOutdated.bind(controller)
  );

  // Write HLS master manifest
  fastify.post(
    '/:videoId/adaptive/m3u8/:manifestType/manifests/masterManifest',
    {
      preHandler: fastify.authenticate,
    },
    controller.writeMasterManifest.bind(controller)
  );

  // Delete comment
  fastify.delete(
    '/:videoId/comments/:commentId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteComment.bind(controller)
  );

  // Update video permission
  fastify.post(
    '/:videoId/permissions',
    {
      preHandler: fastify.authenticate,
    },
    controller.updateVideoPermission.bind(controller)
  );

  // Upload video files (HLS segments, MP4, WebM, OGV)
  fastify.post(
    '/:videoId/upload',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadVideo.bind(controller)
  );

  // Upload stream files (live streaming)
  fastify.post(
    '/:videoId/stream',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadStream.bind(controller)
  );

  // Upload thumbnail image
  fastify.post(
    '/:videoId/images/thumbnail',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadThumbnail.bind(controller)
  );

  // Upload preview image
  fastify.post(
    '/:videoId/images/preview',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadPreview.bind(controller)
  );

  // Upload poster image
  fastify.post(
    '/:videoId/images/poster',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadPoster.bind(controller)
  );

  // Stop publishing/upload
  fastify.post(
    '/:videoId/publishing/stop',
    {
      preHandler: fastify.authenticate,
    },
    controller.stopPublishing.bind(controller)
  );

  // Stop importing
  fastify.post(
    '/:videoId/importing/stop',
    {
      preHandler: fastify.authenticate,
    },
    controller.stopImporting.bind(controller)
  );

  // Set source file extension
  fastify.post(
    '/:videoId/sourceFileExtension',
    {
      preHandler: fastify.authenticate,
    },
    controller.setSourceFileExtension.bind(controller)
  );

  // Get source file extension
  fastify.get(
    '/:videoId/sourceFileExtension',
    {
      preHandler: fastify.authenticate,
    },
    controller.getSourceFileExtension.bind(controller)
  );

  // Get publish status for all formats/resolutions
  fastify.get(
    '/:videoId/publishes',
    {
      preHandler: fastify.authenticate,
    },
    controller.getPublishes.bind(controller)
  );

  // Unpublish specific format/resolution
  fastify.post(
    '/:videoId/unpublish',
    {
      preHandler: fastify.authenticate,
    },
    controller.unpublishFormatResolution.bind(controller)
  );

  // Mark format/resolution as published
  fastify.post(
    '/:videoId/:format/:resolution/published',
    {
      preHandler: fastify.authenticate,
    },
    controller.formatResolutionPublished.bind(controller)
  );

  // Add video to MoarTube index
  fastify.post(
    '/:videoId/index/add',
    {
      preHandler: fastify.authenticate,
    },
    controller.addToIndex.bind(controller)
  );

  // Remove video from MoarTube index
  fastify.post(
    '/:videoId/index/remove',
    {
      preHandler: fastify.authenticate,
    },
    controller.removeFromIndex.bind(controller)
  );
}
