/**
 * Comments Routes
 *
 * Routes for comment search and reporting.
 */
import type { FastifyInstance } from 'fastify';

import { CommentsController } from '../controllers/comments.js';
import type { Container } from '../core/container.js';
import {
  commentIdParamsSchema,
  commentSearchQuerySchema,
  commentReportBodySchema,
} from '../validators/index.js';

/**
 * Register comments routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function commentsRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const commentsRepository = container.resolve('commentsRepository');
  const reportsCommentsRepository = container.resolve('reportsCommentsRepository');
  const videosRepository = container.resolve('videosRepository');
  const cloudflareService = container.resolve('cloudflareService');

  const controller = new CommentsController(
    commentsRepository,
    reportsCommentsRepository,
    videosRepository,
    cloudflareService
  );

  // Search comments - authenticated
  fastify.get(
    '/search',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: commentSearchQuerySchema,
      },
    },
    controller.search.bind(controller)
  );

  // Report a comment - public (no auth required)
  fastify.post(
    '/:commentId/report',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        params: commentIdParamsSchema,
        body: commentReportBodySchema,
      },
    },
    controller.reportComment.bind(controller)
  );
}
