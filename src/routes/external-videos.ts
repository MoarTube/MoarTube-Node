/**
 * External Videos Routes
 *
 * Routes for serving video content (thumbnails, adaptive streams, progressive downloads).
 */
import type { FastifyInstance } from 'fastify';
import { ExternalVideosController } from '../controllers/external-videos.js';
import type { Container } from '../core/container.js';
import {
  externalVideoIdParamsSchema,
  adaptiveManifestParamsSchema,
  adaptiveSegmentParamsSchema,
  progressiveVideoParamsSchema,
} from '../validators/index.js';

/**
 * Register external videos routes
 *
 * Most routes are public (optional auth) for video serving.
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function externalVideosRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videoRepository = container.resolve('videoRepository');
  const controller = new ExternalVideosController(videoRepository);

  // Get base URL - authenticated
  fastify.get(
    '/baseUrl',
    {
      preHandler: [fastify.authenticate],
    },
    controller.getBaseUrl.bind(controller)
  );

  // Thumbnail image - public
  fastify.get(
    '/:videoId/images/thumbnail.jpg',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: externalVideoIdParamsSchema,
      },
    },
    controller.getThumbnail.bind(controller)
  );

  // Preview image - public
  fastify.get(
    '/:videoId/images/preview.jpg',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: externalVideoIdParamsSchema,
      },
    },
    controller.getPreview.bind(controller)
  );

  // Poster image - public
  fastify.get(
    '/:videoId/images/poster.jpg',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: externalVideoIdParamsSchema,
      },
    },
    controller.getPoster.bind(controller)
  );

  // HLS/DASH manifest - public
  fastify.get(
    '/:videoId/adaptive/:format/:type/manifests/:manifestName',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: adaptiveManifestParamsSchema,
      },
    },
    controller.getAdaptiveManifest.bind(controller)
  );

  // HLS/DASH segment - public
  fastify.get(
    '/:videoId/adaptive/:format/:resolution/segments/:segmentName',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: adaptiveSegmentParamsSchema,
      },
    },
    controller.getAdaptiveSegment.bind(controller)
  );

  // Progressive video file - public
  fastify.get(
    '/:videoId/progressive/:format/:progressiveFilename',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: progressiveVideoParamsSchema,
      },
    },
    controller.getProgressive.bind(controller)
  );
}
