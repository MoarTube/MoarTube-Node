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
  const videosRepository = container.resolve('videosRepository');
  const commentsRepository = container.resolve('commentsRepository');
  const linksRepository = container.resolve('linksRepository');
  const monetizationRepository = container.resolve('monetizationRepository');

  const controller = new WatchController(
    videosRepository,
    commentsRepository,
    linksRepository,
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
