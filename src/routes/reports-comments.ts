/**
 * Reports Comments Routes
 *
 * Routes for comment report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsCommentsController } from '../controllers/reports-comments';
import type { Container } from '../core/container';
import { reportIdParamsSchema, reportsQuerySchema, archiveReportBodySchema } from '../validators';

/**
 * Register reports comments routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function reportsCommentsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
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
      preHandler: [fastify.authenticate],
      schema: {
        querystring: reportsQuerySchema,
      },
    },
    controller.getAllReports.bind(controller)
  );

  // Archive a comment report - authenticated
  fastify.post(
    '/archive',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: archiveReportBodySchema,
      },
    },
    controller.archiveReport.bind(controller)
  );

  // Delete a comment report - authenticated
  fastify.delete(
    '/:reportId/delete',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: reportIdParamsSchema,
      },
    },
    controller.deleteReport.bind(controller)
  );
}
