/** Moderation activity endpoints; public browsing lives at / and /home/*. */
import type { FastifyInstance } from 'fastify';
import { NodeController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import { contentCheckedBodySchema } from '@validators/index.js';

export function nodeRoutes(fastify: FastifyInstance, container: Container): void {
  const controller = new NodeController(
    container.resolve('commentsService'),
    container.resolve('reportsService')
  );
  fastify.get(
    '/newContentCounts',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Node'] },
    },
    controller.getNewContentCounts
  );
  fastify.post(
    '/contentChecked',
    {
      preHandler: [fastify.authenticate],
      schema: { tags: ['Node'], body: contentCheckedBodySchema },
    },
    controller.contentChecked
  );
}
