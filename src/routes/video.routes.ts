/**
 * Video Routes
 *
 * Routes for video-related endpoints.
 * Minimal implementation for Phase 5 - will be expanded incrementally.
 */
import type { FastifyInstance } from 'fastify';
import { VideoController } from '../controllers';

/**
 * Register video routes
 *
 * @param fastify - Fastify instance
 */
export function videoRoutes(fastify: FastifyInstance): void {
  const controller = new VideoController();

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

  // Get video by ID
  fastify.get(
    '/:videoId',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getVideo.bind(controller)
  );

  // Get comments
  fastify.get(
    '/:videoId/comments',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getComments.bind(controller)
  );

  // Increment views
  fastify.post(
    '/:videoId/view',
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
    '/:videoId/comment',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.addComment.bind(controller)
  );

  // ============================================================================
  // Protected Endpoints (authentication required)
  // ============================================================================

  // Import video
  fastify.post(
    '/import',
    {
      preHandler: fastify.authenticate,
    },
    controller.importVideo.bind(controller)
  );

  // Update video
  fastify.post(
    '/:videoId/data',
    {
      preHandler: fastify.authenticate,
    },
    controller.updateVideo.bind(controller)
  );

  // Delete video
  fastify.post(
    '/:videoId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteVideo.bind(controller)
  );

  // Finalize video
  fastify.post(
    '/:videoId/finalize',
    {
      preHandler: fastify.authenticate,
    },
    controller.finalizeVideo.bind(controller)
  );

  // Publish video
  fastify.post(
    '/:videoId/publish',
    {
      preHandler: fastify.authenticate,
    },
    controller.publishVideo.bind(controller)
  );

  // Unpublish video
  fastify.post(
    '/:videoId/unpublish',
    {
      preHandler: fastify.authenticate,
    },
    controller.unpublishVideo.bind(controller)
  );

  // Delete comment
  fastify.delete(
    '/:videoId/comments/:commentId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteComment.bind(controller)
  );
}
