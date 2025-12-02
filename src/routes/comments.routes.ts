/**
 * Comments Routes
 *
 * Routes for comment search and reporting.
 */
import type { FastifyInstance } from 'fastify';

import { CommentsController } from '../controllers/comments.controller';
import type { Container } from '../core/container';

/**
 * Register comments routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function commentsRoutes(fastify: FastifyInstance, container: Container): void {
  const commentRepository = container.resolve('commentRepository');
  const commentReportRepository = container.resolve('commentReportRepository');
  const videoRepository = container.resolve('videoRepository');
  const cloudflareService = container.resolve('cloudflareService');

  const controller = new CommentsController(
    commentRepository,
    commentReportRepository,
    videoRepository,
    cloudflareService
  );

  // Search comments - authenticated
  fastify.get(
    '/search',
    {
      preHandler: fastify.authenticate,
    },
    controller.search.bind(controller)
  );

  // Report a comment - public (no auth required)
  fastify.post(
    '/:commentId/report',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.reportComment.bind(controller)
  );
}
