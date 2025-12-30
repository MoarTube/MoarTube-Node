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
  const videosService = container.resolve('videosService');
  const linksService = container.resolve('linksService');
  const monetizationService = container.resolve('monetizationService');
  const commentsService = container.resolve('commentsService');

  const controller = new WatchController(
    videosService,
    linksService,
    monetizationService,
    commentsService
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
