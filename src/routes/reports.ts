/**
 * Reports Routes
 *
 * Routes for report count endpoints.
 */
import type { FastifyInstance } from 'fastify';
import { ReportsController } from '@controllers/index.js';
import type { Container } from '@core/index.js';

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
  const reportsService = container.resolve('reportsService');

  const controller = new ReportsController(reportsService);

  // Get report counts - authenticated
  fastify.get(
    '/count',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Reports'],
      },
    },
    controller.getReportsCount.bind(controller)
  );
}
