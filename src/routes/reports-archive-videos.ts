/**
 * Reports Archive Videos Routes
 *
 * Routes for archived video report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsArchiveVideosController } from '../controllers/reports-archive-videos';
import type { Container } from '../core/container';
import { archiveIdParamsSchema, reportsQuerySchema } from '../validators';

/**
 * Register reports archive videos routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function reportsArchiveVideosRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videoReportsArchiveRepository = container.resolve('videoReportsArchiveRepository');

  const controller = new ReportsArchiveVideosController(videoReportsArchiveRepository);

  // Get all archived video reports - authenticated
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
      schema: {
        querystring: reportsQuerySchema,
      },
    },
    controller.getAllArchives.bind(controller)
  );

  // Delete an archived video report - authenticated
  fastify.delete(
    '/:archiveId/delete',
    {
      preHandler: fastify.authenticate,
      schema: {
        params: archiveIdParamsSchema,
      },
    },
    controller.deleteArchive.bind(controller)
  );
}
