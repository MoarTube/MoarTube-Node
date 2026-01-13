/**
 * External Resources Routes
 *
 * Routes for serving static assets (JavaScript, CSS, fonts, images).
 */
import type { FastifyInstance } from 'fastify';
import { ExternalResourcesController } from '@controllers/index.js';
import { filenameParamsSchema, imageNameParamsSchema } from '@validators/index.js';

/**
 * Register external resources routes
 *
 * All routes are public (no authentication required).
 *
 * @param fastify - Fastify instance with Zod type provider
 */
export function externalResourcesRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>
): void {
  const controller = new ExternalResourcesController();

  // JavaScript files
  fastify.get(
    '/javascript/:filename',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['External-Resources'],
        params: filenameParamsSchema,
      },
    },
    controller.getJavaScript.bind(controller)
  );

  // CSS files
  fastify.get(
    '/css/:filename',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['External-Resources'],
        params: filenameParamsSchema,
      },
    },
    controller.getCss.bind(controller)
  );

  // Font files
  fastify.get(
    '/fonts/:filename',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['External-Resources'],
        params: filenameParamsSchema,
      },
    },
    controller.getFonts.bind(controller)
  );

  // Image files
  fastify.get(
    '/images/:imageName',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['External-Resources'],
        params: imageNameParamsSchema,
      },
    },
    controller.getImage.bind(controller)
  );
}

