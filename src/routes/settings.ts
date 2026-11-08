/**
 * Settings Routes
 *
 * Routes for node settings and configuration endpoints.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '@core/index.js';
import { cloudflareTunnelToggleBodySchema } from '@/config/cloudflare-tunnel.js';
import { SettingsController } from '@controllers/index.js';
import { z } from 'zod';
import {
  personalizeNodeNameBodySchema,
  personalizeNodeHeadlineBodySchema,
  personalizeNodeAboutBodySchema,
  personalizeNodeBulletinBodySchema,
  personalizeNodeLinksBodySchema,
  personalizeNodeIconsBodySchema,
  updateAccountBodySchema,
  networkInternalBodySchema,
  networkExternalBodySchema,
  cloudflareConfigureBodySchema,
  cloudflareTurnstileConfigureBodySchema,
  featureToggleBodySchema,
  databaseConfigToggleBodySchema,
  storageConfigToggleBodySchema,
  secureToggleQuerySchema,
} from '@validators/index.js';

/**
 * Register settings routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function settingsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const settingsService = container.resolve('settingsService');
  // Runtime worker management is authenticated and coordinated by the primary.
  const videosService = container.resolve('videosService');
  const cloudflareService = container.resolve('cloudflareService');
  const websocketService = container.resolve('websocketService');

  const controller = new SettingsController(
    settingsService,
    videosService,
    cloudflareService,
    websocketService
  );
  fastify.get(
    '/workers',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getWorkerCount
  );
  fastify.post(
    '/workers',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: z
          .object({
            workerCount: z.number().int().nonnegative(),
            confirmDecrease: z.boolean().optional(),
          })
          .strict(),
      },
    },
    controller.setWorkerCount
  );
  // ============================================================================
  // Settings Root
  // ============================================================================

  fastify.get(
    '/metrics',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getMetricsBundle
  );

  fastify.get(
    '/metrics/disk',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getMetrics
  );

  fastify.get(
    '/metrics/memory',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getMemoryMetrics
  );

  fastify.get(
    '/metrics/cpu',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getCpuMetrics
  );

  // Read-only Cloudflare Tunnel runtime status
  fastify.post(
    '/cloudflare/tunnel/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Settings'], body: cloudflareTunnelToggleBodySchema },
    },
    controller.cloudflareTunnelToggle
  );

  // Read-only Cloudflare Tunnel runtime status
  fastify.get(
    '/cloudflare/tunnel',
    { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } },
    controller.getCloudflareTunnel
  );

  // Get all settings
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
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
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.getAvatar.bind(controller)
  );

  // Upload avatar (requires auth)
  fastify.post(
    '/avatar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.uploadAvatar.bind(controller)
  );

  // Get banner (public)
  fastify.get(
    '/banner',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.getBanner.bind(controller)
  );

  // Upload banner (requires auth)
  fastify.post(
    '/banner',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.uploadBanner.bind(controller)
  );

  // ============================================================================
  // Personalization
  // ============================================================================

  // Update node name
  fastify.post(
    '/personalize/name',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: personalizeNodeNameBodySchema,
      },
    },
    controller.personalizeNodeName.bind(controller)
  );

  // Update node headline
  fastify.post(
    '/personalize/headline',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: personalizeNodeHeadlineBodySchema,
      },
    },
    controller.personalizeNodeHeadline.bind(controller)
  );

  // Replace the ordered node bulletin.
  fastify.post(
    '/personalize/bulletin',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Settings'], body: personalizeNodeBulletinBodySchema },
    },
    controller.personalizeNodeBulletin
  );

  fastify.post(
    '/personalize/icons',
    {
      bodyLimit: 3 * 1024 * 1024,
      preHandler: [fastify.authenticate],
      schema: { tags: ['Settings'], body: personalizeNodeIconsBodySchema },
    },
    controller.personalizeNodeIcons
  );

  // Replace the ordered node links.
  fastify.post(
    '/personalize/links',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Settings'], body: personalizeNodeLinksBodySchema },
    },
    controller.personalizeNodeLinks
  );

  // Update node about
  fastify.post(
    '/personalize/about',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: personalizeNodeAboutBodySchema,
      },
    },
    controller.personalizeNodeAbout.bind(controller)
  );

  // ============================================================================
  // Security
  // ============================================================================

  // Update secure mode (HTTPS)
  fastify.post(
    '/secure',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        querystring: secureToggleQuerySchema,
      },
    },
    controller.configureSecure.bind(controller)
  );

  // Update account credentials
  fastify.post(
    '/account',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: updateAccountBodySchema,
      },
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
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: networkInternalBodySchema,
      },
    },
    controller.networkInternal.bind(controller)
  );

  // Update external network settings
  fastify.post(
    '/network/external',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: networkExternalBodySchema,
      },
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
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: cloudflareConfigureBodySchema,
      },
    },
    controller.cloudflareConfigure.bind(controller)
  );

  // Clear Cloudflare configuration
  fastify.post(
    '/cloudflare/clear',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.cloudflareClear.bind(controller)
  );

  fastify.post(
    '/cloudflare/retry',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Settings'] },
    },
    controller.cloudflareRetry.bind(controller)
  );

  // Configure Cloudflare Turnstile
  fastify.post(
    '/cloudflare/turnstile/configure',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: cloudflareTurnstileConfigureBodySchema,
      },
    },
    controller.cloudflareTurnstileConfigure.bind(controller)
  );

  // Clear Cloudflare Turnstile configuration
  fastify.post(
    '/cloudflare/turnstile/clear',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
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
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: featureToggleBodySchema,
      },
    },
    controller.commentsToggle.bind(controller)
  );

  // Toggle likes
  fastify.post(
    '/likes/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: featureToggleBodySchema,
      },
    },
    controller.likesToggle.bind(controller)
  );

  // Toggle dislikes
  fastify.post(
    '/dislikes/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: featureToggleBodySchema,
      },
    },
    controller.dislikesToggle.bind(controller)
  );

  // Toggle reports
  fastify.post(
    '/reports/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: featureToggleBodySchema,
      },
    },
    controller.reportsToggle.bind(controller)
  );

  // Toggle live chat
  fastify.post(
    '/liveChat/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: featureToggleBodySchema,
      },
    },
    controller.liveChatToggle.bind(controller)
  );

  // ============================================================================
  // Database & Storage Configuration
  // ============================================================================

  // Toggle database configuration
  fastify.post(
    '/database/config/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: databaseConfigToggleBodySchema,
      },
    },
    controller.databaseConfigToggle.bind(controller)
  );

  // Toggle storage configuration
  fastify.post(
    '/storage/config/toggle',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
        body: storageConfigToggleBodySchema,
      },
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
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.exportDatabase.bind(controller)
  );

  // Import database
  // Note: File upload handling would need @fastify/multipart plugin
  fastify.post(
    '/import/database',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.importDatabase.bind(controller)
  );

  // ============================================================================
  // Server Restart
  // ============================================================================

  // Restart the node server (idempotent, separate from config changes)
  fastify.post(
    '/restart',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Settings'],
      },
    },
    controller.restartServer.bind(controller)
  );
}
