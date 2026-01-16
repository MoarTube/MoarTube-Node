/**
 * Reports Comments Routes
 *
 * Routes for comment report management.
 */
import type { FastifyInstance } from 'fastify';
import { ReportsCommentsController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import {
  reportIdParamsSchema,
  reportsQuerySchema,
  archiveReportBodySchema,
} from '@validators/index.js';

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
  const reportsService = container.resolve('reportsService');

  const controller = new ReportsCommentsController(reportsService);

  // Get all comment reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Reports'],
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
        tags: ['Reports'],
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
        tags: ['Reports'],
        params: reportIdParamsSchema,
      },
    },
    controller.deleteReport.bind(controller)
  );
}
