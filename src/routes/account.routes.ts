/**
 * Account Routes
 *
 * Routes for authentication and account management.
 */
import type { FastifyInstance } from 'fastify';
import { AccountController } from '../controllers';
import { validateBody } from '../plugins';
import { signInBodySchema } from '../validators';
import type { Container } from '../core/container';

/**
 * Register account routes
 *
 * @param fastify - Fastify instance
 * @param container - DI container
 */
export function accountRoutes(fastify: FastifyInstance, container: Container): void {
  const authService = container.resolve('authService');
  const controller = new AccountController(authService);

  // Sign in - public endpoint
  fastify.post(
    '/signin',
    {
      preHandler: fastify.optionalAuthenticate,
      preValidation: validateBody(signInBodySchema),
    },
    controller.signIn.bind(controller)
  );

  // Sign out - public endpoint (client just discards token)
  fastify.get(
    '/signout',
    {
      preHandler: fastify.optionalAuthenticate,
    },
    controller.signOut.bind(controller)
  );

  // Check authentication status - protected endpoint
  fastify.get(
    '/authenticated',
    {
      preHandler: fastify.authenticate,
    },
    controller.authenticated.bind(controller)
  );
}
