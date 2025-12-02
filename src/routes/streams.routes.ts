/**
 * Streams Routes
 *
 * Routes for live streaming endpoints.
 */
import type { FastifyInstance } from 'fastify';

import type { Container } from '../core/container';
import { StreamsController } from '../controllers';

/**
 * Register streams routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function streamsRoutes(fastify: FastifyInstance, container: Container): void {
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
      preHandler: fastify.authenticate,
    },
    controller.startStream.bind(controller)
  );

  // Stop a stream
  fastify.post(
    '/:videoId/stop',
    {
      preHandler: fastify.authenticate,
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
      preHandler: fastify.authenticate,
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
      preHandler: fastify.authenticate,
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
      preHandler: fastify.authenticate,
    },
    controller.updateChatSettings.bind(controller)
  );

  // Get chat history (public)
  fastify.get(
    '/:videoId/chat/history',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getChatHistory.bind(controller)
  );
}
