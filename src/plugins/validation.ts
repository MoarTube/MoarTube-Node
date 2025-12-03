/**
 * Validation Plugin
 *
 * Zod-based request validation for Fastify.
 * Uses fastify-type-provider-zod for native Fastify schema validation.
 *
 * With the Zod type provider configured in plugins/index.ts, routes can
 * define schemas directly in the route options and get full TypeScript
 * inference for request body, query, params, and response types.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const bodySchema = z.object({
 *   username: z.string(),
 *   password: z.string(),
 * });
 *
 * fastify.post('/signin', {
 *   schema: {
 *     body: bodySchema,
 *   }
 * }, async (request, reply) => {
 *   // request.body is fully typed as { username: string; password: string }
 *   const { username, password } = request.body;
 * });
 * ```
 */

// Re-export Zod for convenience
export { z } from 'zod';

// Re-export type provider types
export type { ZodTypeProvider } from 'fastify-type-provider-zod';

// Import shared validation error types
export { ValidationError, type ValidationErrorDetails } from '../errors/index.js';
