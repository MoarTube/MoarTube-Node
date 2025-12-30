/**
 * Streams Routes
 *
 * Routes for live streaming endpoints.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '@core/container.js';
import { StreamsController } from '@controllers/index.js';
import {
  streamVideoIdParamsSchema,
  streamSegmentParamsSchema,
  streamStartBodySchema,
  chatSettingsBodySchema,
  removeSegmentBodySchema,
  chatHistoryQuerySchema,
} from '@validators/index.js';

/**
 * Register streams routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function streamsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videosService = container.resolve('videosService');
  const liveChatService = container.resolve('liveChatService');
  const streamsService = container.resolve('streamsService');

  const controller = new StreamsController(videosService, liveChatService, streamsService);

  // ============================================================================
  // Stream Lifecycle
  // ============================================================================

  // Start a stream
  fastify.post(
    '/start',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: streamStartBodySchema,
      },
    },
    controller.startStream.bind(controller)
  );

  // Stop a stream
  fastify.post(
    '/:videoId/stop',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: streamVideoIdParamsSchema,
      },
    },
    controller.stopStream.bind(controller)
  );

  // ============================================================================
  // Stream Segments
  // ============================================================================

  // Remove a segment file
  fastify.post(
    '/:videoId/adaptive/:format/:resolution/segments/remove',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: streamSegmentParamsSchema,
        body: removeSegmentBodySchema,
      },
    },
    controller.removeSegment.bind(controller)
  );

  // ============================================================================
  // Stream Monitoring
  // ============================================================================

  // Get stream bandwidth
  fastify.get(
    '/:videoId/bandwidth',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: streamVideoIdParamsSchema,
      },
    },
    controller.getBandwidth.bind(controller)
  );

  // ============================================================================
  // Chat Settings
  // ============================================================================

  // Update chat settings
  fastify.post(
    '/:videoId/chat/settings',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: streamVideoIdParamsSchema,
        body: chatSettingsBodySchema,
      },
    },
    controller.updateChatSettings.bind(controller)
  );

  // Get chat history (public)
  fastify.get(
    '/:videoId/chat/history',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: streamVideoIdParamsSchema,
        querystring: chatHistoryQuerySchema,
      },
    },
    controller.getChatHistory.bind(controller)
  );
}
