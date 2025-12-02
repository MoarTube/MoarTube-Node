/**
 * Streams Routes
 *
 * Routes for live streaming endpoints.
 */
import type { FastifyInstance } from 'fastify';

import type { Container } from '../core/container';
import { StreamsController } from '../controllers';
import {
  streamVideoIdParamsSchema,
  streamSegmentParamsSchema,
  streamStartBodySchema,
  chatSettingsBodySchema,
  removeSegmentBodySchema,
  chatHistoryQuerySchema,
} from '../validators';

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
  const videoRepository = container.resolve('videoRepository');
  const liveChatMessageRepository = container.resolve('liveChatMessageRepository');
  const streamService = container.resolve('streamService');

  const controller = new StreamsController(
    videoRepository,
    liveChatMessageRepository,
    streamService
  );

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
