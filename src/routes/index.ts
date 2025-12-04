/**
 * Routes Module
 *
 * Barrel export and route registration for Fastify.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../core/container.js';

/**
 * Fastify instance with Zod type provider
 */
export type FastifyZod = FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>;

// Route definitions
export { statusRoutes, healthRoutes } from './status.js';
export { accountRoutes } from './account.js';
export { videosRoutes } from './videos.js';
export { baseRoutes } from './base.js';
export { linksRoutes } from './links.js';
export { monetizationRoutes } from './monetization.js';
export { watchEmbedRoutes } from './watch-embed.js';
export { externalResourcesRoutes } from './external-resources.js';
export { externalVideosRoutes } from './external-videos.js';
export { commentsRoutes } from './comments.js';
export { watchRoutes } from './watch.js';
export { nodeRoutes } from './node.js';
export { reportsRoutes } from './reports.js';
export { reportsVideosRoutes } from './reports-videos.js';
export { reportsCommentsRoutes } from './reports-comments.js';
export { reportsArchiveVideosRoutes } from './reports-archive-videos.js';
export { reportsArchiveCommentsRoutes } from './reports-archive-comments.js';
export { settingsRoutes } from './settings.js';
export { streamsRoutes } from './streams.js';

// Import for registration
import { statusRoutes, healthRoutes } from './status.js';
import { accountRoutes } from './account.js';
import { videosRoutes } from './videos.js';
import { baseRoutes } from './base.js';
import { linksRoutes } from './links.js';
import { monetizationRoutes } from './monetization.js';
import { watchEmbedRoutes } from './watch-embed.js';
import { externalResourcesRoutes } from './external-resources.js';
import { externalVideosRoutes } from './external-videos.js';
import { commentsRoutes } from './comments.js';
import { watchRoutes } from './watch.js';
import { nodeRoutes } from './node.js';
import { reportsRoutes } from './reports.js';
import { reportsVideosRoutes } from './reports-videos.js';
import { reportsCommentsRoutes } from './reports-comments.js';
import { reportsArchiveVideosRoutes } from './reports-archive-videos.js';
import { reportsArchiveCommentsRoutes } from './reports-archive-comments.js';
import { settingsRoutes } from './settings.js';
import { streamsRoutes } from './streams.js';

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
  fastify.register(
    (instance) => {
      videosRoutes(instance.withTypeProvider<ZodTypeProvider>());
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
  fastify.register(
    (instance) => {
      settingsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
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
