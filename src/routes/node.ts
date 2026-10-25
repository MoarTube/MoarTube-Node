/**
 * Node Routes
 *
 * Routes for the main node page and related endpoints.
 */
import type { FastifyInstance } from 'fastify';
import { NodeController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import { nodeSearchQuerySchema, contentCheckedBodySchema } from '@validators/index.js';

/**
 * Create the controller shared by the browsing page and node APIs.
 *
 * @param container - DI container
 */
function createNodeController(container: Container): NodeController {
  const videosService = container.resolve('videosService');
  const linksService = container.resolve('linksService');
  const monetizationService = container.resolve('monetizationService');
  const streamsService = container.resolve('streamsService');
  const commentsService = container.resolve('commentsService');
  const reportsService = container.resolve('reportsService');

  return new NodeController(
    videosService,
    linksService,
    monetizationService,
    streamsService,
    commentsService,
    reportsService
  );
}

/** Register the public video browsing page under /videos. */
export function nodePageRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const controller = createNodeController(container);

  // Node page - public (no auth required)
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Node'],
        querystring: nodeSearchQuerySchema,
      },
    },
    controller.getNodePage.bind(controller)
  );
}

/** Register node API endpoints and redirect the former browsing page. */
export function nodeRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const controller = createNodeController(container);

  fastify.get('/', {}, async (request, reply) => {
    const queryIndex = request.url.indexOf('?');
    const query = queryIndex === -1 ? '' : request.url.substring(queryIndex);
    return reply.redirect('/videos' + query, 301);
  });

  // Search videos - public (no auth required)
  fastify.get(
    '/search',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Node'],
        querystring: nodeSearchQuerySchema,
      },
    },
    controller.search.bind(controller)
  );

  // Get new content counts - authenticated
  fastify.get(
    '/newContentCounts',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Node'],
      },
    },
    controller.getNewContentCounts.bind(controller)
  );

  // Mark content as checked - authenticated
  fastify.post(
    '/contentChecked',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Node'],
        body: contentCheckedBodySchema,
      },
    },
    controller.contentChecked.bind(controller)
  );
}
