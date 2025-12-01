/**
 * Routes Module
 *
 * Barrel export and route registration for Fastify.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../core/container';

// Route definitions
export { statusRoutes, healthRoutes } from './status.routes';
export { accountRoutes } from './account.routes';
export { videoRoutes } from './video.routes';

// Import for registration
import { statusRoutes, healthRoutes } from './status.routes';
import { accountRoutes } from './account.routes';
import { videoRoutes } from './video.routes';

/**
 * Register all application routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container for dependency injection
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  container: Container
): Promise<void> {
  // Health check routes (top-level)
  healthRoutes(fastify, container);

  // Status routes (/status/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      statusRoutes(instance, container);
      done();
    },
    { prefix: '/status' }
  );

  // Account routes (/account/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      accountRoutes(instance, container);
      done();
    },
    { prefix: '/account' }
  );

  // Video routes (/videos/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      videoRoutes(instance);
      done();
    },
    { prefix: '/videos' }
  );
}
