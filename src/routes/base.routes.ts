/**
 * Base Routes
 *
 * Root-level routes for the application.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Register base routes
 *
 * Handles root path redirects.
 *
 * @param fastify - Fastify instance
 */
export function baseRoutes(fastify: FastifyInstance): void {
  // Root redirect - redirects to /node
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const redirectUrl = '/node' + request.url.substring(1);
    void reply.redirect(redirectUrl);
  });
}
