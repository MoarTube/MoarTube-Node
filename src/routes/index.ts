/**
 * Routes Module
 *
 * Barrel export and route registration for Fastify.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../core/container';

/**
 * Fastify instance with Zod type provider
 */
export type FastifyZod = FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>;

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
 * @param fastify - Fastify instance with Zod type provider
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
    (instance, _opts, done) => {
      statusRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/status' }
  );

  // Account routes (/account/*)
  await fastify.register(
    (instance, _opts, done) => {
      accountRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/account' }
  );

  // Videos routes (/videos/*)
  await fastify.register(
    async (instance) => {
      await videosRoutes(instance.withTypeProvider<ZodTypeProvider>());
    },
    { prefix: '/videos' }
  );

  // Links routes (/links/*)
  await fastify.register(
    (instance, _opts, done) => {
      linksRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/links' }
  );

  // Monetization routes (/monetization/*)
  await fastify.register(
    (instance, _opts, done) => {
      monetizationRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/monetization' }
  );

  // Watch embed routes (/watch/embed/*)
  await fastify.register(
    (instance, _opts, done) => {
      watchEmbedRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/watch/embed' }
  );

  // External resources routes (/external/resources/*)
  await fastify.register(
    (instance, _opts, done) => {
      externalResourcesRoutes(instance.withTypeProvider<ZodTypeProvider>());
      done();
    },
    { prefix: '/external/resources' }
  );

  // External videos routes (/external/videos/*)
  await fastify.register(
    (instance, _opts, done) => {
      externalVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/external/videos' }
  );

  // Comments routes (/comments/*)
  await fastify.register(
    (instance, _opts, done) => {
      commentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/comments' }
  );

  // Watch routes (/watch)
  await fastify.register(
    (instance, _opts, done) => {
      watchRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/watch' }
  );

  // Node routes (/node/*)
  await fastify.register(
    (instance, _opts, done) => {
      nodeRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/node' }
  );

  // Reports routes (/reports/*)
  await fastify.register(
    (instance, _opts, done) => {
      reportsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/reports' }
  );

  // Reports videos routes (/reports/videos/*)
  await fastify.register(
    (instance, _opts, done) => {
      reportsVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/reports/videos' }
  );

  // Reports comments routes (/reports/comments/*)
  await fastify.register(
    (instance, _opts, done) => {
      reportsCommentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/reports/comments' }
  );

  // Reports archive videos routes (/reports/archive/videos/*)
  await fastify.register(
    (instance, _opts, done) => {
      reportsArchiveVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/reports/archive/videos' }
  );

  // Reports archive comments routes (/reports/archive/comments/*)
  await fastify.register(
    (instance, _opts, done) => {
      reportsArchiveCommentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/reports/archive/comments' }
  );

  // Settings routes (/settings/*)
  await fastify.register(
    async (instance) => {
      await settingsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/settings' }
  );

  // Streams routes (/streams/*)
  await fastify.register(
    (instance, _opts, done) => {
      streamsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
      done();
    },
    { prefix: '/streams' }
  );
}
