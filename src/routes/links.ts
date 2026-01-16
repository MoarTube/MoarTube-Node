/**
 * Links Routes
 *
 * Routes for social link management.
 */
import type { FastifyInstance } from 'fastify';
import { LinksController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import { addLinkBodySchema, deleteLinkBodySchema } from '@validators/index.js';

/**
 * Register links routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function linksRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const linksService = container.resolve('linksService');
  const cloudflareService = container.resolve('cloudflareService');
  const controller = new LinksController(linksService, cloudflareService);

  // Get all links - public (no auth required)
  fastify.get(
    '/all',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Links'],
      },
    },
    controller.getAllLinks.bind(controller)
  );

  // Add link - authenticated
  fastify.post(
    '/add',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Links'],
        body: addLinkBodySchema,
      },
    },
    controller.addLink.bind(controller)
  );

  // Delete link - authenticated
  fastify.post(
    '/delete',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Links'],
        body: deleteLinkBodySchema,
      },
    },
    controller.deleteLink.bind(controller)
  );
}
