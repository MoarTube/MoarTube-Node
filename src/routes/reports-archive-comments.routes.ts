/**
 * Reports Archive Comments Routes
 *
 * Routes for archived comment report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsArchiveCommentsController } from '../controllers/reports-archive-comments.controller';
import type { Container } from '../core/container';

/**
 * Register reports archive comments routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function reportsArchiveCommentsRoutes(fastify: FastifyInstance, container: Container): void {
  const commentReportsArchiveRepository = container.resolve('commentReportsArchiveRepository');

  const controller = new ReportsArchiveCommentsController(commentReportsArchiveRepository);

  // Get all archived comment reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
    },
    controller.getAllArchives.bind(controller)
  );

  // Delete an archived comment report - authenticated
  fastify.delete(
    '/:archiveId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteArchive.bind(controller)
  );
}
