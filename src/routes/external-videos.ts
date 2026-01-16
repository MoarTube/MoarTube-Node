/**
 * External Videos Routes
 *
 * Routes for serving video content (thumbnails, adaptive streams, progressive downloads).
 */
import type { FastifyInstance } from 'fastify';
import { ExternalVideosController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import {
  externalVideoIdParamsSchema,
  adaptiveManifestParamsSchema,
  adaptiveSegmentParamsSchema,
  progressiveVideoParamsSchema,
} from '@validators/index.js';

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
  const videosService = container.resolve('videosService');
  const controller = new ExternalVideosController(videosService);

  // Get base URL - authenticated
  fastify.get(
    '/baseUrl',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['External-Videos'],
      },
    },
    controller.getBaseUrl.bind(controller)
  );

  // Thumbnail image - public
  fastify.get(
    '/:videoId/images/thumbnail.jpg',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['External-Videos'],
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
        tags: ['External-Videos'],
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
        tags: ['External-Videos'],
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
        tags: ['External-Videos'],
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
        tags: ['External-Videos'],
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
        tags: ['External-Videos'],
        params: progressiveVideoParamsSchema,
      },
    },
    controller.getProgressive.bind(controller)
  );
}
