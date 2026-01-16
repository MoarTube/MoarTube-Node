/**
 * Node Routes
 *
 * Routes for the main node page and related endpoints.
 */
import type { FastifyInstance } from 'fastify';
import { NodeController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import { nodeSearchQuerySchema, contentCheckedBodySchema } from '@validators/index.js';

/**
 * Register node routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function nodeRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videosService = container.resolve('videosService');
  const linksService = container.resolve('linksService');
  const monetizationService = container.resolve('monetizationService');
  const streamsService = container.resolve('streamsService');
  const commentsService = container.resolve('commentsService');
  const reportsService = container.resolve('reportsService');

  const controller = new NodeController(
    videosService,
    linksService,
    monetizationService,
    streamsService,
    commentsService,
    reportsService
  );

  // Node page - public (no auth required)
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Node'],
        querystring: nodeSearchQuerySchema,
      },
    },
    controller.getNodePage.bind(controller)
  );

  // Search videos - public (no auth required)
  fastify.get(
    '/search',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Node'],
        querystring: nodeSearchQuerySchema,
      },
    },
    controller.search.bind(controller)
  );

  // Get new content counts - authenticated
  fastify.get(
    '/newContentCounts',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Node'],
      },
    },
    controller.getNewContentCounts.bind(controller)
  );

  // Mark content as checked - authenticated
  fastify.post(
    '/contentChecked',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Node'],
        body: contentCheckedBodySchema,
      },
    },
    controller.contentChecked.bind(controller)
  );
}
