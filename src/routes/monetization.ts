/**
 * Monetization Routes
 *
 * Routes for crypto wallet address management.
 */
import type { FastifyInstance } from 'fastify';
import { MonetizationController } from '@controllers/index.js';
import type { Container } from '@core/index.js';
import { addWalletAddressBodySchema, deleteWalletAddressBodySchema } from '@validators/index.js';

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
  const monetizationService = container.resolve('monetizationService');
  const cloudflareService = container.resolve('cloudflareService');
  const controller = new MonetizationController(monetizationService, cloudflareService);

  // Get all wallet addresses - public (no auth required)
  fastify.get(
    '/all',
    {
      preHandler: [fastify.optionalAuthenticate],
      schema: {
        tags: ['Monetization'],
      },
    },
    controller.getAllWalletAddresses.bind(controller)
  );

  // Add wallet address - authenticated
  fastify.post(
    '/add',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Monetization'],
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
        tags: ['Monetization'],
        body: deleteWalletAddressBodySchema,
      },
    },
    controller.deleteWalletAddress.bind(controller)
  );
}

