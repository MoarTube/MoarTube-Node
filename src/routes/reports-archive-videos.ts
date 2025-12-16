/**
 * Reports Archive Videos Routes
 *
 * Routes for archived video report management.
 */
import type { FastifyInstance } from 'fastify';

import { ReportsArchiveVideosController } from '../controllers/reports-archive-videos.js';
import type { Container } from '../core/container.js';
import { archiveIdParamsSchema, reportsQuerySchema } from '../validators/index.js';

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
  const reportsArchiveVideosRepository = container.resolve('reportsArchiveVideosRepository');

  const controller = new ReportsArchiveVideosController(reportsArchiveVideosRepository);

  // Get all archived video reports - authenticated
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

  // Delete an archived video report - authenticated
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
