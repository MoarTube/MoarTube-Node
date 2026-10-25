/**
 * Base Routes
 *
 * Root-level routes for the application.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register base routes
 *
 * Renders the node home page.
 *
 * @param fastify - Fastify instance
 */
export function baseRoutes(fastify: FastifyInstance): void {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    return reply.view('index');
  });
}
