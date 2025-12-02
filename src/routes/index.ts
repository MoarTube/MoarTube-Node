/**
 * Routes Module
 *
 * Barrel export and route registration for Fastify.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../core/container';

// Route definitions
export { statusRoutes, healthRoutes } from './status';
export { accountRoutes } from './account';
export { videosRoutes } from './videos';
export { baseRoutes } from './base';
export { linksRoutes } from './links';
export { monetizationRoutes } from './monetization';
export { watchEmbedRoutes } from './watch-embed';
export { externalResourcesRoutes } from './external-resources';
export { externalVideosRoutes } from './external-videos';
export { commentsRoutes } from './comments';
export { watchRoutes } from './watch';
export { nodeRoutes } from './node';
export { reportsRoutes } from './reports';
export { reportsVideosRoutes } from './reports-videos';
export { reportsCommentsRoutes } from './reports-comments';
export { reportsArchiveVideosRoutes } from './reports-archive-videos';
export { reportsArchiveCommentsRoutes } from './reports-archive-comments';
export { settingsRoutes } from './settings';
export { streamsRoutes } from './streams';

// Import for registration
import { statusRoutes, healthRoutes } from './status';
import { accountRoutes } from './account';
import { videosRoutes } from './videos';
import { baseRoutes } from './base';
import { linksRoutes } from './links';
import { monetizationRoutes } from './monetization';
import { watchEmbedRoutes } from './watch-embed';
import { externalResourcesRoutes } from './external-resources';
import { externalVideosRoutes } from './external-videos';
import { commentsRoutes } from './comments';
import { watchRoutes } from './watch';
import { nodeRoutes } from './node';
import { reportsRoutes } from './reports';
import { reportsVideosRoutes } from './reports-videos';
import { reportsCommentsRoutes } from './reports-comments';
import { reportsArchiveVideosRoutes } from './reports-archive-videos';
import { reportsArchiveCommentsRoutes } from './reports-archive-comments';
import { settingsRoutes } from './settings';
import { streamsRoutes } from './streams';

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

  // Videos routes (/videos/*)
  await fastify.register(
    async (instance: FastifyInstance) => {
      await videosRoutes(instance);
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

  // Comments routes (/comments/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      commentsRoutes(instance, container);
      done();
    },
    { prefix: '/comments' }
  );

  // Watch routes (/watch)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      watchRoutes(instance, container);
      done();
    },
    { prefix: '/watch' }
  );

  // Node routes (/node/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      nodeRoutes(instance, container);
      done();
    },
    { prefix: '/node' }
  );

  // Reports routes (/reports/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      reportsRoutes(instance, container);
      done();
    },
    { prefix: '/reports' }
  );

  // Reports videos routes (/reports/videos/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      reportsVideosRoutes(instance, container);
      done();
    },
    { prefix: '/reports/videos' }
  );

  // Reports comments routes (/reports/comments/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      reportsCommentsRoutes(instance, container);
      done();
    },
    { prefix: '/reports/comments' }
  );

  // Reports archive videos routes (/reports/archive/videos/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      reportsArchiveVideosRoutes(instance, container);
      done();
    },
    { prefix: '/reports/archive/videos' }
  );

  // Reports archive comments routes (/reports/archive/comments/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      reportsArchiveCommentsRoutes(instance, container);
      done();
    },
    { prefix: '/reports/archive/comments' }
  );

  // Settings routes (/settings/*)
  await fastify.register(
    async (instance: FastifyInstance) => {
      await settingsRoutes(instance, container);
    },
    { prefix: '/settings' }
  );

  // Streams routes (/streams/*)
  await fastify.register(
    (instance: FastifyInstance, _opts: Record<string, unknown>, done: (err?: Error) => void) => {
      streamsRoutes(instance, container);
      done();
    },
    { prefix: '/streams' }
  );
}
