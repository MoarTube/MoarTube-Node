/**
 * Account Routes
 *
 * Routes for authentication and account management.
 */
import type { FastifyInstance } from 'fastify';
import { AccountController } from '../controllers/index.js';
import { signInBodySchema } from '../validators/index.js';
import type { Container } from '../core/container.js';

/**
 * Register account routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function accountRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const accountService = container.resolve('accountService');
  const controller = new AccountController(accountService);

  // Sign in - public endpoint
  fastify.post(
    '/signin',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        body: signInBodySchema,
      },
    },
    controller.signIn.bind(controller)
  );

  // Sign out - public endpoint (client just discards token)
  fastify.get(
    '/signout',
    {
      preHandler: [fastify.optionalAuthenticate],
    },
    controller.signOut.bind(controller)
  );

  // Check authentication status - protected endpoint
  fastify.get(
    '/authenticated',
    {
      preHandler: [fastify.authenticate],
    },
    controller.authenticated.bind(controller)
  );
}
