import type { FastifyInstance } from 'fastify';
import type { Container } from '@/core/container.js';
import { homeRoutes } from '@/routes/home.js';

/** Public homepage and its read-only data endpoints. */
export function baseRoutes(fastify: FastifyInstance, container: Container): void {
  homeRoutes(fastify, container);
}
