/**
 * Reports Videos Routes
 *
 * Routes for video report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsVideosController } from '../controllers/reports-videos';
import type { Container } from '../core/container';

/**
 * Register reports videos routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function reportsVideosRoutes(fastify: FastifyInstance, container: Container): void {
  const videoReportRepository = container.resolve('videoReportRepository');
  const videoReportsArchiveRepository = container.resolve('videoReportsArchiveRepository');

  const controller = new ReportsVideosController(
    videoReportRepository,
    videoReportsArchiveRepository
  );

  // Get all video reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
    },
    controller.getAllReports.bind(controller)
  );

  // Archive a video report - authenticated
  fastify.post(
    '/archive',
    {
      preHandler: fastify.authenticate,
    },
    controller.archiveReport.bind(controller)
  );

  // Delete a video report - authenticated
  fastify.delete(
    '/:reportId/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteReport.bind(controller)
  );
}
