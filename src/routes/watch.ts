/**
 * Watch Routes
 *
 * Routes for the main video watch page.
 */
import type { FastifyInstance } from 'fastify';

import { WatchController } from '../controllers/watch.js';
import type { Container } from '../core/container.js';
import { watchQuerySchema } from '../validators/index.js';

/**
 * Register watch routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function watchRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videoRepository = container.resolve('videoRepository');
  const commentRepository = container.resolve('commentsRepository');
  const linkRepository = container.resolve('linkRepository');
  const monetizationRepository = container.resolve('monetizationRepository');

  const controller = new WatchController(
    videoRepository,
    commentRepository,
    linkRepository,
    monetizationRepository
  );

  // Watch page - public (no auth required)
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        querystring: watchQuerySchema,
      },
    },
    controller.getWatchPage.bind(controller)
  );
}
