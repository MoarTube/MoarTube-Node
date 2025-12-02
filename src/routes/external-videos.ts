/**
 * External Videos Routes
 *
 * Routes for serving video content (thumbnails, adaptive streams, progressive downloads).
 */
import type { FastifyInstance } from 'fastify';
import { ExternalVideosController } from '../controllers/external-videos';
import type { Container } from '../core/container';

/**
 * Register external videos routes
 *
 * Most routes are public (optional auth) for video serving.
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function externalVideosRoutes(fastify: FastifyInstance, container: Container): void {
  const videoRepository = container.resolve('videoRepository');
  const controller = new ExternalVideosController(videoRepository);

  // Get base URL - authenticated
  fastify.get(
    '/baseUrl',
    {
      preHandler: fastify.authenticate,
    },
    controller.getBaseUrl.bind(controller)
  );

  // Thumbnail image - public
  fastify.get(
    '/:videoId/images/thumbnail.jpg',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getThumbnail.bind(controller)
  );

  // Preview image - public
  fastify.get(
    '/:videoId/images/preview.jpg',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getPreview.bind(controller)
  );

  // Poster image - public
  fastify.get(
    '/:videoId/images/poster.jpg',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getPoster.bind(controller)
  );

  // HLS/DASH manifest - public
  fastify.get(
    '/:videoId/adaptive/:format/:type/manifests/:manifestName',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAdaptiveManifest.bind(controller)
  );

  // HLS/DASH segment - public
  fastify.get(
    '/:videoId/adaptive/:format/:resolution/segments/:segmentName',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAdaptiveSegment.bind(controller)
  );

  // Progressive video file - public
  fastify.get(
    '/:videoId/progressive/:format/:progressiveFilename',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getProgressive.bind(controller)
  );
}
