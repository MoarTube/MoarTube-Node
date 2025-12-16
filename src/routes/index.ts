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
export { statusRoutes } from './status.js';
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
import { statusRoutes } from './status.js';
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
export function registerRoutes(fastify: FastifyInstance, container: Container): void {
  // Base routes (root redirect)
  baseRoutes(fastify);

  // Status routes (/status/*)
  fastify.register(
    (instance) => {
      statusRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/status' }
  );

  // Account routes (/account/*)
  fastify.register(
    (instance) => {
      accountRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/account' }
  );

  // Videos routes (/videos/*)
  fastify.register(
    (instance) => {
      videosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/videos' }
  );

  // Links routes (/links/*)
  fastify.register(
    (instance) => {
      linksRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/links' }
  );

  // Monetization routes (/monetization/*)
  fastify.register(
    (instance) => {
      monetizationRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/monetization' }
  );

  // Watch embed routes (/watch/embed/*)
  fastify.register(
    (instance) => {
      watchEmbedRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/watch/embed' }
  );

  // External resources routes (/external/resources/*)
  fastify.register(
    (instance) => {
      externalResourcesRoutes(instance.withTypeProvider<ZodTypeProvider>());
    },
    { prefix: '/external/resources' }
  );

  // External videos routes (/external/videos/*)
  fastify.register(
    (instance) => {
      externalVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/external/videos' }
  );

  // Comments routes (/comments/*)
  fastify.register(
    (instance) => {
      commentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/comments' }
  );

  // Watch routes (/watch)
  fastify.register(
    (instance) => {
      watchRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/watch' }
  );

  // Node routes (/node/*)
  fastify.register(
    (instance) => {
      nodeRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/node' }
  );

  // Reports routes (/reports/*)
  fastify.register(
    (instance) => {
      reportsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/reports' }
  );

  // Reports videos routes (/reports/videos/*)
  fastify.register(
    (instance) => {
      reportsVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/reports/videos' }
  );

  // Reports comments routes (/reports/comments/*)
  fastify.register(
    (instance) => {
      reportsCommentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/reports/comments' }
  );

  // Reports archive videos routes (/reports/archive/videos/*)
  fastify.register(
    (instance) => {
      reportsArchiveVideosRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/reports/archive/videos' }
  );

  // Reports archive comments routes (/reports/archive/comments/*)
  fastify.register(
    (instance) => {
      reportsArchiveCommentsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
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
  fastify.register(
    (instance) => {
      streamsRoutes(instance.withTypeProvider<ZodTypeProvider>(), container);
    },
    { prefix: '/streams' }
  );
}
