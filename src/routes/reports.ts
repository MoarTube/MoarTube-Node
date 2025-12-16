/**
 * Reports Routes
 *
 * Routes for report count endpoints.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsController } from '../controllers/reports.js';
import type { Container } from '../core/container.js';

/**
 * Register reports routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function reportsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const reportsVideosRepository = container.resolve('reportsVideosRepository');
  const reportsCommentsRepository = container.resolve('reportsCommentsRepository');

  const controller = new ReportsController(reportsVideosRepository, reportsCommentsRepository);

  // Get report counts - authenticated
  fastify.get(
    '/count',
    {
      preHandler: [fastify.authenticate],
    },
    controller.getReportsCount.bind(controller)
  );
}
