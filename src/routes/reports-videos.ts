/**
 * Reports Videos Routes
 *
 * Routes for video report management.
 */
import type { FastifyInstance } from 'fastify';
import { ReportsVideosController } from '../controllers/reports-videos.js';
import type { Container } from '../core/container.js';
import {
  reportIdParamsSchema,
  reportsQuerySchema,
  archiveReportBodySchema,
} from '../validators/index.js';

/**
 * Register reports videos routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function reportsVideosRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const reportsService = container.resolve('reportsService');

  const controller = new ReportsVideosController(reportsService);

  // Get all video reports - authenticated
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

  // Archive a video report - authenticated
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

  // Delete a video report - authenticated
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
