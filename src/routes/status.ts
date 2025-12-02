/**
 * Status Routes
 *
 * Routes for status and health check endpoints.
 */
import type { FastifyInstance } from 'fastify';
import { StatusController } from '../controllers';
import type { Container } from '../core/container';

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
  const controller = new StatusController(container);

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

/**
 * Register health check routes (top-level)
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function healthRoutes(fastify: FastifyInstance, container: Container): void {
  const controller = new StatusController(container);

  // Health check endpoints (no authentication)
  fastify.get('/health', controller.health.bind(controller));
  fastify.get('/health/ready', controller.healthReady.bind(controller));
}
