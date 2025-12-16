/**
 * Node Routes
 *
 * Routes for the main node page and related endpoints.
 */
import type { FastifyInstance } from 'fastify';

import { NodeController } from '../controllers/node.js';
import type { Container } from '../core/container.js';
import { nodeSearchQuerySchema, contentCheckedBodySchema } from '../validators/index.js';

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
  const videosRepository = container.resolve('videosRepository');
  const commentsRepository = container.resolve('commentsRepository');
  const reportsVideosRepository = container.resolve('reportsVideosRepository');
  const reportsCommentsRepository = container.resolve('reportsCommentsRepository');
  const linksRepository = container.resolve('linksRepository');
  const monetizationRepository = container.resolve('monetizationRepository');

  const controller = new NodeController(
    videosRepository,
    commentsRepository,
    reportsVideosRepository,
    reportsCommentsRepository,
    linksRepository,
    monetizationRepository
  );

  // Node page - public (no auth required)
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
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
    },
    controller.getNewContentCounts.bind(controller)
  );

  // Mark content as checked - authenticated
  fastify.post(
    '/contentChecked',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: contentCheckedBodySchema,
      },
    },
    controller.contentChecked.bind(controller)
  );
}
