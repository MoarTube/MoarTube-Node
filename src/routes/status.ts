/**
 * Status Routes
 *
 * Routes for status and health check endpoints.
 */
import type { FastifyInstance } from 'fastify';
import { StatusController } from '@controllers/index.js';
import type { Container } from '@core/index.js';

/**
 * Register status routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function statusRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videosService = container.resolve('videosService');
  const controller = new StatusController(videosService);

  // Public endpoints (no authentication required)
  fastify.get(
    '/information',
    {
      preHandler: [fastify.optionalAuthenticate],
    },
    controller.information.bind(controller)
  );

  fastify.get(
    '/heartbeat',
    {
      preHandler: [fastify.optionalAuthenticate],
    },
    controller.heartbeat.bind(controller)
  );
}
