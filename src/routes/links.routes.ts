/**
 * Links Routes
 *
 * Routes for social link management.
 */
import type { FastifyInstance } from 'fastify';
import { LinksController } from '../controllers/links.controller';
import type { Container } from '../core/container';

/**
 * Register links routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function linksRoutes(fastify: FastifyInstance, container: Container): void {
  const linkRepository = container.resolve('linkRepository');
  const cloudflareService = container.resolve('cloudflareService');
  const controller = new LinksController(linkRepository, cloudflareService);

  // Get all links - public (no auth required)
  fastify.get(
    '/all',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getAllLinks.bind(controller)
  );

  // Add link - authenticated
  fastify.post(
    '/add',
    {
      preHandler: fastify.authenticate,
    },
    controller.addLink.bind(controller)
  );

  // Delete link - authenticated
  fastify.post(
    '/delete',
    {
      preHandler: fastify.authenticate,
    },
    controller.deleteLink.bind(controller)
  );
}
