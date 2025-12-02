/**
 * Watch Embed Routes
 *
 * Routes for embedded video and chat pages.
 */
import type { FastifyInstance } from 'fastify';
import { WatchEmbedController } from '../controllers/watch-embed.controller';
import type { Container } from '../core/container';

/**
 * Register watch embed routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function watchEmbedRoutes(fastify: FastifyInstance, container: Container): void {
  const videoRepository = container.resolve('videoRepository');
  const linkRepository = container.resolve('linkRepository');
  const cryptoWalletAddressRepository = container.resolve('cryptoWalletAddressRepository');

  const controller = new WatchEmbedController(
    videoRepository,
    linkRepository,
    cryptoWalletAddressRepository
  );

  // Embedded video player - public (optional auth for password-protected videos)
  fastify.get(
    '/video/:videoId',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getEmbedVideo.bind(controller)
  );

  // Embedded chat - public (optional auth)
  fastify.get(
    '/chat/:videoId',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getEmbedChat.bind(controller)
  );
}
