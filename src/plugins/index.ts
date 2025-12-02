/**
 * Fastify Plugins Module
 *
 * Barrel export for all Fastify plugins and app factory.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { createAppContainer } from '../core/container';
import { getDatabase } from '../database';
import { registerRoutes } from '../routes';
import { getConfig } from '../config';

// Error handling
export { default as errorHandlerPlugin } from './error-handler';

// Authentication
export { default as authenticationPlugin } from './authentication';

// Re-export type provider for route typing
export type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * Fastify instance with Zod type provider
 */
export type FastifyZodInstance = FastifyInstance;

/**
 * Create and configure a Fastify application instance with Zod validation
 *
 * @returns Configured Fastify instance with Zod type provider
 */
export async function createFastifyApp(): Promise<FastifyInstance> {
  const config = getConfig();

  // Create Fastify instance
  const app = Fastify({
    logger: config.isDeveloperMode
      ? {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
    trustProxy: true,
  });

  // Set up Zod validation and serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register multipart support (for file uploads)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 1024 * 1024 * 1024 * 10, // 10GB
    },
  });

  // Create DI container with database
  const db = getDatabase();
  const container = createAppContainer(db);

  // Register routes with Zod type provider
  await registerRoutes(app.withTypeProvider<ZodTypeProvider>(), container);

  // Register error handler
  const { default: errorHandlerPlugin } = await import('./error-handler');
  await app.register(errorHandlerPlugin);

  return app;
}
