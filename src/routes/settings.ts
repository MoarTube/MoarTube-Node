/**
 * Settings Routes
 *
 * Routes for node settings and configuration endpoints.
 */
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

import type { Container } from '../core/container';
import { SettingsController } from '../controllers';

/**
 * Register settings routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export async function settingsRoutes(
  fastify: FastifyInstance,
  container: Container
): Promise<void> {
  // Register multipart plugin for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
      files: 5, // max 5 files at once
    },
  });

  const settingsService = container.resolve('settingsService');
  const videoRepository = container.resolve('videoRepository');
  const cloudflareService = container.resolve('cloudflareService');
  const websocketService = container.resolve('websocketService');

  const controller = new SettingsController(
    settingsService,
    videoRepository,
    cloudflareService,
    websocketService
  );

  // ============================================================================
  // Settings Root
  // ============================================================================

  // Get all settings
  fastify.get(
    '/',
    {
      preHandler: fastify.authenticate,
    },
    controller.getSettings.bind(controller)
  );

  // ============================================================================
  // Avatar & Banner
  // ============================================================================

  // Get avatar (public)
  fastify.get(
    '/avatar',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAvatar.bind(controller)
  );

  // Upload avatar (requires auth)
  fastify.post(
    '/avatar',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadAvatar.bind(controller)
  );

  // Get banner (public)
  fastify.get(
    '/banner',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getBanner.bind(controller)
  );

  // Upload banner (requires auth)
  fastify.post(
    '/banner',
    {
      preHandler: fastify.authenticate,
    },
    controller.uploadBanner.bind(controller)
  );

  // ============================================================================
  // Personalization
  // ============================================================================

  // Update node name
  fastify.post(
    '/personalize/nodeName',
    {
      preHandler: fastify.authenticate,
    },
    controller.personalizeNodeName.bind(controller)
  );

  // Update node about
  fastify.post(
    '/personalize/nodeAbout',
    {
      preHandler: fastify.authenticate,
    },
    controller.personalizeNodeAbout.bind(controller)
  );

  // Update node ID
  fastify.post(
    '/personalize/nodeId',
    {
      preHandler: fastify.authenticate,
    },
    controller.personalizeNodeId.bind(controller)
  );

  // ============================================================================
  // Security
  // ============================================================================

  // Update secure mode (HTTPS)
  fastify.post(
    '/secure',
    {
      preHandler: fastify.authenticate,
    },
    controller.configureSecure.bind(controller)
  );

  // Update account credentials
  fastify.post(
    '/account',
    {
      preHandler: fastify.authenticate,
    },
    controller.updateAccount.bind(controller)
  );

  // ============================================================================
  // Network Configuration
  // ============================================================================

  // Update internal network settings
  fastify.post(
    '/network/internal',
    {
      preHandler: fastify.authenticate,
    },
    controller.networkInternal.bind(controller)
  );

  // Update external network settings
  fastify.post(
    '/network/external',
    {
      preHandler: fastify.authenticate,
    },
    controller.networkExternal.bind(controller)
  );

  // ============================================================================
  // Cloudflare Configuration
  // ============================================================================

  // Configure Cloudflare
  fastify.post(
    '/cloudflare/configure',
    {
      preHandler: fastify.authenticate,
    },
    controller.cloudflareConfigure.bind(controller)
  );

  // Clear Cloudflare configuration
  fastify.post(
    '/cloudflare/clear',
    {
      preHandler: fastify.authenticate,
    },
    controller.cloudflareClear.bind(controller)
  );

  // Configure Cloudflare Turnstile
  fastify.post(
    '/cloudflare/turnstile/configure',
    {
      preHandler: fastify.authenticate,
    },
    controller.cloudflareTurnstileConfigure.bind(controller)
  );

  // Clear Cloudflare Turnstile configuration
  fastify.post(
    '/cloudflare/turnstile/clear',
    {
      preHandler: fastify.authenticate,
    },
    controller.cloudflareTurnstileClear.bind(controller)
  );

  // ============================================================================
  // Feature Toggles
  // ============================================================================

  // Toggle comments
  fastify.post(
    '/comments/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.commentsToggle.bind(controller)
  );

  // Toggle likes
  fastify.post(
    '/likes/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.likesToggle.bind(controller)
  );

  // Toggle dislikes
  fastify.post(
    '/dislikes/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.dislikesToggle.bind(controller)
  );

  // Toggle reports
  fastify.post(
    '/reports/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.reportsToggle.bind(controller)
  );

  // Toggle live chat
  fastify.post(
    '/liveChat/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.liveChatToggle.bind(controller)
  );

  // ============================================================================
  // Database & Storage Configuration
  // ============================================================================

  // Toggle database configuration
  fastify.post(
    '/databaseConfig/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.databaseConfigToggle.bind(controller)
  );

  // Toggle storage configuration
  fastify.post(
    '/storageConfig/toggle',
    {
      preHandler: fastify.authenticate,
    },
    controller.storageConfigToggle.bind(controller)
  );

  // ============================================================================
  // Database Import/Export
  // ============================================================================

  // Export database
  fastify.get(
    '/export/database',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.exportDatabase.bind(controller)
  );

  // Import database
  // Note: File upload handling would need @fastify/multipart plugin
  fastify.post(
    '/import/database',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.importDatabase.bind(controller)
  );
}
