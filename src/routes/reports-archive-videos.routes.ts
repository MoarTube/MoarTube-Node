/**
 * Reports Archive Videos Routes
 *
 * Routes for archived video report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsArchiveVideosController } from '../controllers/reports-archive-videos.controller';
import type { Container } from '../core/container';

/**
 * Register reports archive videos routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function reportsArchiveVideosRoutes(fastify: FastifyInstance, container: Container): void {
  const videoReportsArchiveRepository = container.resolve('videoReportsArchiveRepository');

  const controller = new ReportsArchiveVideosController(videoReportsArchiveRepository);

  // Get all archived video reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
    },
    controller.getAllArchives.bind(controller)
  );

  // Delete an archived video report - authenticated
  fastify.delete(
    '/:archiveId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteArchive.bind(controller)
  );
}
