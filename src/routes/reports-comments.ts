/**
 * Reports Comments Routes
 *
 * Routes for comment report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsCommentsController } from '../controllers/reports-comments';
import type { Container } from '../core/container';

/**
 * Register reports comments routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function reportsCommentsRoutes(fastify: FastifyInstance, container: Container): void {
  const commentReportRepository = container.resolve('commentReportRepository');
  const commentReportsArchiveRepository = container.resolve('commentReportsArchiveRepository');

  const controller = new ReportsCommentsController(
    commentReportRepository,
    commentReportsArchiveRepository
  );

  // Get all comment reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
    },
    controller.getAllReports.bind(controller)
  );

  // Archive a comment report - authenticated
  fastify.post(
    '/archive',
    {
      preHandler: fastify.authenticate,
    },
    controller.archiveReport.bind(controller)
  );

  // Delete a comment report - authenticated
  fastify.delete(
    '/:reportId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteReport.bind(controller)
  );
}
