/**
 * Node Routes
 *
 * Routes for the main node page and related endpoints.
 */
import type { FastifyInstance } from 'fastify';

import { NodeController } from '../controllers/node';
import type { Container } from '../core/container';
import { nodeSearchQuerySchema, contentCheckedBodySchema } from '../validators';

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
  const videoRepository = container.resolve('videoRepository');
  const commentRepository = container.resolve('commentRepository');
  const videoReportRepository = container.resolve('videoReportRepository');
  const commentReportRepository = container.resolve('commentReportRepository');
  const linkRepository = container.resolve('linkRepository');
  const monetizationRepository = container.resolve('monetizationRepository');

  const controller = new NodeController(
    videoRepository,
    commentRepository,
    videoReportRepository,
    commentReportRepository,
    linkRepository,
    monetizationRepository
  );

  // Node page - public (no auth required)
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
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
