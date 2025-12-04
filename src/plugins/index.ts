/**
 * Fastify Plugins Module
 *
 * Barrel export for all Fastify plugins and app factory.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyLoggerOptions,
} from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

import { createAppContainer } from '../core/container.js';
import { getDatabase } from '../database/index.js';
import { getConfig } from '../config/index.js';
import { registerRoutes } from '../routes/index.js';
import authenticationPlugin from './authentication.js';

/**
 * Middleware to check if node is configured
 * Blocks all requests except allowed endpoints until initial setup is complete
 */
function nodeSetupMiddleware(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    // Skip middleware if node is already configured
    if (isNodeConfigured()) {
      return;
    }

    // Allow certain endpoints during setup
    if (isAllowedEndpoint(request)) {
      return;
    }

    // Block all other requests with setup required error
    return reply.status(503).send({
      isError: true,
      message:
        'This MoarTube Node needs to be configured before use. Please sign in via the MoarTube Client to complete the initial setup.',
    });
  });
}

/**
 * Check if the node has been configured with public URL settings
 */
function isNodeConfigured(): boolean {
  const config = getConfig();
  const settings = config.nodeSettings;

  return Boolean(
    settings.publicNodeProtocol && settings.publicNodeAddress && settings.publicNodePort
  );
}

/**
 * Check if the current request should be allowed during setup
 */
function isAllowedEndpoint(request: FastifyRequest): boolean {
  const url = request.url;
  const method = request.method;

  // Allow account endpoints
  if (url.startsWith('/account')) {
    return true;
  }

  // Allow status endpoints
  if (url.startsWith('/status')) {
    return true;
  }

  // Allow OPTIONS requests (CORS pre-flight)
  if (method === 'OPTIONS') {
    return true;
  }

  return false;
}

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

  // Register authentication plugin
  await app.register(authenticationPlugin);

  // Register node setup middleware (blocks requests until configured)
  nodeSetupMiddleware(app);

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
