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
export { baseRoutes } from './base.routes';
export { linksRoutes } from './links.routes';
export { monetizationRoutes } from './monetization.routes';
export { watchEmbedRoutes } from './watch-embed.routes';
export { externalResourcesRoutes } from './external-resources.routes';
export { externalVideosRoutes } from './external-videos.routes';

// Import for registration
import { statusRoutes, healthRoutes } from './status.routes';
import { accountRoutes } from './account.routes';
import { videoRoutes } from './video.routes';
import { baseRoutes } from './base.routes';
import { linksRoutes } from './links.routes';
import { monetizationRoutes } from './monetization.routes';
import { watchEmbedRoutes } from './watch-embed.routes';
import { externalResourcesRoutes } from './external-resources.routes';
import { externalVideosRoutes } from './external-videos.routes';

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

  // Base routes (root redirect)
  baseRoutes(fastify);

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

  // Links routes (/links/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      linksRoutes(instance, container);
      done();
    },
    { prefix: '/links' }
  );

  // Monetization routes (/monetization/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      monetizationRoutes(instance, container);
      done();
    },
    { prefix: '/monetization' }
  );

  // Watch embed routes (/watch/embed/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      watchEmbedRoutes(instance, container);
      done();
    },
    { prefix: '/watch/embed' }
  );

  // External resources routes (/external/resources/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      externalResourcesRoutes(instance);
      done();
    },
    { prefix: '/external/resources' }
  );

  // External videos routes (/external/videos/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      externalVideosRoutes(instance, container);
      done();
    },
    { prefix: '/external/videos' }
  );
}
