/**
 * Monetization Routes
 *
 * Routes for crypto wallet address management.
 */
import type { FastifyInstance } from 'fastify';
import { MonetizationController } from '../controllers/monetization';
import type { Container } from '../core/container';
import { addWalletAddressBodySchema, deleteWalletAddressBodySchema } from '../validators';

/**
 * Register monetization routes
 *
 * @param fastify - Fastify instance with Zod type provider
 * @param container - DI container
 */
export function monetizationRoutes(
  fastify: FastifyInstance & ReturnType<FastifyInstance['withTypeProvider']>,
  container: Container
): void {
  const monetizationRepository = container.resolve('monetizationRepository');
  const cloudflareService = container.resolve('cloudflareService');
  const controller = new MonetizationController(monetizationRepository, cloudflareService);

  // Get all wallet addresses - public (no auth required)
  fastify.get(
    '/all',
    {
      preHandler: [fastify.optionalAuthenticate],
    },
    controller.getAllWalletAddresses.bind(controller)
  );

  // Add wallet address - authenticated
  fastify.post(
    '/add',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: addWalletAddressBodySchema,
      },
    },
    controller.addWalletAddress.bind(controller)
  );

  // Delete wallet address - authenticated
  fastify.post(
    '/delete',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: deleteWalletAddressBodySchema,
      },
    },
    controller.deleteWalletAddress.bind(controller)
  );
}
