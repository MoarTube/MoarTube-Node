/**
 * Reports Archive Comments Routes
 *
 * Routes for archived comment report management.
 */
import type { FastifyInstance } from 'fastify';
import { ReportsArchiveCommentsController } from '@controllers/reports-archive-comments.js';
import type { Container } from '@core/container.js';
import { archiveIdParamsSchema, reportsQuerySchema } from '@validators/index.js';

/**
 * Register reports archive comments routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function reportsArchiveCommentsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const reportsService = container.resolve('reportsService');

  const controller = new ReportsArchiveCommentsController(reportsService);

  // Get all archived comment reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: reportsQuerySchema,
      },
    },
    controller.getAllArchives.bind(controller)
  );

  // Delete an archived comment report - authenticated
  fastify.delete(
    '/:archiveId/delete',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: archiveIdParamsSchema,
      },
    },
    controller.deleteArchive.bind(controller)
  );
}
