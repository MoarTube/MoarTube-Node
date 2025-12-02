/**
 * Watch Routes
 *
 * Routes for the main video watch page.
 */
import type { FastifyInstance } from 'fastify';

import { WatchController } from '../controllers/watch.controller';
import type { Container } from '../core/container';

/**
 * Register watch routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function watchRoutes(fastify: FastifyInstance, container: Container): void {
  const videoRepository = container.resolve('videoRepository');
  const commentRepository = container.resolve('commentRepository');
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
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getWatchPage.bind(controller)
  );
}
