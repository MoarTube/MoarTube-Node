/**
 * Fastify Plugins Module
 *
 * Barrel export for all Fastify plugins and app factory.
 */

import Fastify, { type FastifyInstance, type FastifyLoggerOptions } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyView from '@fastify/view';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

import { createAppContainer } from '../core/container.js';
import { getDatabase } from '../database/index.js';
import { registerRoutes } from '../routes/index.js';
import authenticationPlugin from './authentication.js';

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
export { default as errorHandlerPlugin } from './error-handler.js';

// Authentication
// export { default as authenticationPlugin } from './authentication.js'; // Now imported directly

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
  // Create Fastify instance with pino-pretty logger
  const app = Fastify({
    logger: getLoggerConfig(),
    trustProxy: true,
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

  // Register view engine with EJS templating
  await app.register(fastifyView, {
    engine: {
      ejs: (await import('ejs')).default,
    },
    root: './public/views',
    viewExt: 'ejs',
  });

  // Register authentication plugin
  await app.register(authenticationPlugin);

  // Create DI container with database
  const db = getDatabase();
  const container = createAppContainer(db);

  // Register routes with Zod type provider
  registerRoutes(app.withTypeProvider<ZodTypeProvider>(), container);

  // Register error handler
  const { default: errorHandlerPlugin } = await import('./error-handler.js');
  await app.register(errorHandlerPlugin);

  return app;
}
