import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Container } from '@/core/container.js';
import { HomeController } from '@/controllers/home.js';
import { noStoreComments } from '@/utils/comment-cache.js';

export const homeQuerySchema = z.object({
  searchTerm: z.string().trim().max(500).default(''),
  tagTerm: z.string().trim().max(500).default(''),
  tagSearch: z.string().trim().max(500).default(''),
  commentSearch: z.string().trim().max(500).default(''),
  sortTerm: z.enum(['hot', 'new', 'recently-discussed', 'discussed', 'viewed']).default('hot'),
  view: z.enum(['videos', 'about', 'community']).default('videos'),
  epoch: z.string().max(100).optional(),
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  snapshot: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  fresh: z.literal('1').optional(),
});

export function homeRoutes(fastify: FastifyInstance, container: Container): void {
  const controller = new HomeController(container.resolve('homeService'));
  const options = {
    onRequest: noStoreComments,
    onSend: async (_request: unknown, reply: FastifyReply, payload: unknown) => {
      if (reply.statusCode >= 400) {
        reply.header('Cache-Control', 'no-store');
      }
      return payload;
    },
    preHandler: [fastify.optionalAuthenticate],
    schema: { querystring: homeQuerySchema, tags: ['Homepage'] },
  };
  fastify.get('/', options, controller.page);
  for (const kind of ['state', 'videos', 'comments', 'tags', 'settings'] as const) {
    fastify.get(`/home/${kind}`, options, controller.read(kind));
  }
}
