/**
 * Reports Routes
 *
 * Routes for report count endpoints.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsController } from '../controllers/reports';
import type { Container } from '../core/container';

/**
 * Register reports routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function reportsRoutes(fastify: FastifyInstance, container: Container): void {
  const videoReportRepository = container.resolve('videoReportRepository');
  const commentReportRepository = container.resolve('commentReportRepository');

  const controller = new ReportsController(videoReportRepository, commentReportRepository);

  // Get report counts - authenticated
  fastify.get(
    '/count',
    {
      preHandler: fastify.authenticate,
    },
    controller.getReportsCount.bind(controller)
  );
}
