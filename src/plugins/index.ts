/**
 * Fastify Plugins Module
 *
 * Barrel export for all Fastify plugins and app factory.
 */

import Fastify, { type FastifyInstance, type FastifyLoggerOptions } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyFormbody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import fastifyView from '@fastify/view';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

import { getConfig } from '@config/index.js';
import { createAppContainer } from '@core/index.js';
import { getDatabase } from '@database/index.js';
import { registerRoutes } from '@routes/index.js';
import authenticationPlugin from '@plugins/authentication.js';
import swaggerPlugin from '@plugins/swagger.js';

/**
 * Get logger configuration for Fastify
 * Always uses pino-pretty for readable output
 */
function getLoggerConfig(): FastifyLoggerOptions & PinoLoggerOptions {
  return {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  };
}

// Error handling
export { default as errorHandlerPlugin } from '@plugins/error-handler.js';

// Re-export type provider for route typing
export type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * Create and configure a Fastify application instance with Zod validation
 *
 * @returns Configured Fastify instance with Zod type provider
 */
export async function createFastifyApp(): Promise<FastifyInstance> {
  // Create Fastify instance with pino-pretty logger
  const app = Fastify({
    logger: getLoggerConfig(),
    trustProxy: true,
  });

  // Register CORS to allow any origin
  await app.register(fastifyCors, {
    origin: true, // Allow any origin
  });

  // Set up Zod validation and serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register multipart support (for file uploads)
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 1000 * 1000 * 1000 * 1000, // 1TB
    },
  });

  // Register formbody support (for application/x-www-form-urlencoded)
  await app.register(fastifyFormbody);

  // Register view engine with EJS templating
  // Use configured paths from Config singleton to ensure correct path in bundled builds
  const config = getConfig();
  const viewsRoot = config.paths.viewsDirectoryPath;

  await app.register(fastifyView, {
    engine: {
      ejs: (await import('ejs')).default,
    },
    root: viewsRoot,
    viewExt: 'ejs',
  });

  // Register authentication plugin
  await app.register(authenticationPlugin);

  // Register Swagger/OpenAPI documentation
  await app.register(swaggerPlugin);

  // Create DI container with database
  const db = getDatabase();
  const container = await createAppContainer(db);

  // Register routes with Zod type provider
  registerRoutes(app.withTypeProvider<ZodTypeProvider>(), container);

  // Register error handler
  const { default: errorHandlerPlugin } = await import('@plugins/error-handler.js');
  await app.register(errorHandlerPlugin);

  return app;
}
