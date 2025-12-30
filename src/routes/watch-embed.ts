/**
 * Watch Embed Routes
 *
 * Routes for embedded video and chat pages.
 */
import type { FastifyInstance } from 'fastify';
import { WatchEmbedController } from '../controllers/watch-embed.js';
import type { Container } from '../core/container.js';
import { watchEmbedVideoIdParamsSchema } from '../validators/index.js';

/**
 * Register watch embed routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function watchEmbedRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const videosService = container.resolve('videosService');
  const linksService = container.resolve('linksService');
  const monetizationService = container.resolve('monetizationService');

  const controller = new WatchEmbedController(
    videosService,
    linksService,
    monetizationService
  );

  // Embedded video player - public (optional auth for password-protected videos)
  fastify.get(
    '/video/:videoId',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: watchEmbedVideoIdParamsSchema,
      },
    },
    controller.getEmbedVideo.bind(controller)
  );

  // Embedded chat - public (optional auth)
  fastify.get(
    '/chat/:videoId',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: watchEmbedVideoIdParamsSchema,
      },
    },
    controller.getEmbedChat.bind(controller)
  );
}
