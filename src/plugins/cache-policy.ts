import type { FastifyInstance } from 'fastify';
import { cacheableMediaRequest } from '@/utils/media-cache.js';

/** Start private; handlers explicitly promote successful, anonymous public reads. */
export function installCachePolicy(app: FastifyInstance): void {
  app.addHook('onRequest', (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return Promise.resolve();
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (
      reply.statusCode >= 400 ||
      request.headers.authorization !== undefined ||
      reply.hasHeader('Set-Cookie') ||
      !cacheableMediaRequest(request.url, request.headers) ||
      (request.method !== 'GET' && request.method !== 'HEAD')
    ) {
      reply.header('Cache-Control', 'no-store');
      reply.removeHeader('Cache-Tag');
    }
    return payload;
  });
}
