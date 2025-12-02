/**
 * Watch Embed Routes
 *
 * Routes for embedded video and chat pages.
 */
import type { FastifyInstance } from 'fastify';
import { WatchEmbedController } from '../controllers/watch-embed';
import type { Container } from '../core/container';
import { watchEmbedVideoIdParamsSchema } from '../validators';

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
  const videoRepository = container.resolve('videoRepository');
  const linkRepository = container.resolve('linkRepository');
  const monetizationRepository = container.resolve('monetizationRepository');

  const controller = new WatchEmbedController(
    videoRepository,
    linkRepository,
    monetizationRepository
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
