/**
 * Swagger/OpenAPI Plugin
 *
 * Provides API documentation via Swagger UI.
 * Documentation is available at /documentation in development mode.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger, { type SwaggerOptions } from '@fastify/swagger';
import swaggerUi, { type FastifySwaggerUiOptions } from '@fastify/swagger-ui';

/**
 * OpenAPI specification configuration
 */
const openApiSpec: SwaggerOptions = {
  openapi: {
    info: {
      title: 'MoarTube Node API',
      description: `
## MoarTube Node REST API

A free, open-source, self-hosted, anonymous, decentralized video/live stream platform.

### Features
- **Video Management**: Upload, transcode, and manage video content
- **Live Streaming**: HLS live streaming with real-time chat
- **Comments**: Anonymous commenting system with moderation
- **Monetization**: Cryptocurrency wallet integration
- **Reports**: Content moderation and reporting system

### Authentication
Most endpoints require authentication via JWT token.
Use the \`/account/signin\` endpoint to obtain a token.

### Rate Limiting
API endpoints may be rate-limited to prevent abuse.
      `,
      version: '1.1.0',
      contact: {
        name: 'MoarTube Support',
        url: 'https://www.moartube.com',
      },
      license: {
        name: 'Custom License',
        url: 'https://github.com/MoarTube/MoarTube-Node/blob/main/LICENSE.md',
      },
    },
    externalDocs: {
      description: 'MoarTube Documentation',
      url: 'https://www.moartube.com/guides',
    },
    servers: [
      {
        url: 'http://localhost:80',
        description: 'Local development server',
      },
    ],
    tags: [
      { name: 'Account', description: 'Authentication and account management' },
      { name: 'Videos', description: 'Video management and playback' },
      { name: 'Streams', description: 'Live streaming operations' },
      { name: 'Comments', description: 'Video comments and moderation' },
      { name: 'Settings', description: 'Node configuration and settings' },
      { name: 'Reports', description: 'Content reporting and moderation' },
      { name: 'Monetization', description: 'Cryptocurrency wallet management' },
      { name: 'Links', description: 'External link management' },
      { name: 'Node', description: 'Node information and search' },
      { name: 'Status', description: 'Health check and status' },
      { name: 'Watch', description: 'Video and stream playback pages' },
      { name: 'External', description: 'External resource serving' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token obtained from /account/signin',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
};

/**
 * Swagger UI configuration
 */
export const swaggerUiConfig: FastifySwaggerUiOptions = {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    syntaxHighlight: {
      activate: true,
      theme: 'monokai',
    },
  },
  staticCSP: true,
  transformStaticCSP: (header: string): string => header,
};

/**
 * Register Swagger/OpenAPI documentation plugin
 */
async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  // Only enable Swagger in development or when explicitly enabled
  const isProduction = process.env['NODE_ENV'] === 'production';
  const enableInProduction = process.env['ENABLE_SWAGGER_IN_PRODUCTION'] === 'true';

  if (isProduction && !enableInProduction) {
    app.log.info('Swagger documentation disabled in production');
    return;
  }

  // Register Swagger schema generator
  await app.register(swagger, openApiSpec);

  // Register Swagger UI
  await app.register(swaggerUi, swaggerUiConfig);

  app.log.info('Swagger documentation available at /documentation');
}

export default fp(swaggerPlugin, {
  name: 'swagger',
  fastify: '5.x',
});
