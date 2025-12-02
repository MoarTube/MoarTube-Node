/**
 * External Resources Routes
 *
 * Routes for serving static assets (JavaScript, CSS, fonts, images).
 */
import type { FastifyInstance } from 'fastify';
import { ExternalResourcesController } from '../controllers/external-resources.controller';

/**
 * Register external resources routes
 *
 * All routes are public (no authentication required).
 *
 * @param fastify - Fastify instance
 */
export function externalResourcesRoutes(fastify: FastifyInstance): void {
  const controller = new ExternalResourcesController();

  // JavaScript files
  fastify.get(
    '/javascript/:filename',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getJavaScript.bind(controller)
  );

  // CSS files
  fastify.get(
    '/css/:filename',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getCss.bind(controller)
  );

  // Font files
  fastify.get(
    '/fonts/:filename',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getFonts.bind(controller)
  );

  // Image files
  fastify.get(
    '/images/:imageName',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.getImage.bind(controller)
  );
}
