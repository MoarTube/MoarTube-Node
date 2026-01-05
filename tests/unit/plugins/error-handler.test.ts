/**
 * Unit tests for Error Handler Plugin
 *
 * Tests centralized error handling for Fastify including
 * AppError handling, Zod validation errors, Fastify validation errors,
 * and unexpected errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/errors/index.js';

import errorHandlerPlugin from '@plugins/error-handler.js';

describe('Error Handler Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('plugin registration', () => {
    it('should register error handler on Fastify instance', async () => {
      // The error handler is registered, we can test by throwing an error
      app.get('/test-error', async () => {
        throw new Error('Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test-error',
      });

      // Should get a 500 response with proper format
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });
  });

  describe('AppError handling', () => {
    it('should handle BadRequestError (400)', async () => {
      app.get('/bad-request', async () => {
        throw new BadRequestError('Invalid input provided');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/bad-request',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Invalid input provided');
    });

    it('should handle UnauthorizedError (401)', async () => {
      app.get('/unauthorized', async () => {
        throw new UnauthorizedError('Authentication required');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/unauthorized',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Authentication required');
    });

    it('should handle ForbiddenError (403)', async () => {
      app.get('/forbidden', async () => {
        throw new ForbiddenError('Access denied');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/forbidden',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Access denied');
    });

    it('should handle NotFoundError (404)', async () => {
      app.get('/not-found', async () => {
        throw new NotFoundError('Resource not found');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/not-found',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Resource not found');
    });

    it('should handle ValidationError with field details', async () => {
      app.get('/validation-error', async () => {
        throw new ValidationError('Validation failed', [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too short' },
        ]);
      });

      const response = await app.inject({
        method: 'GET',
        url: '/validation-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toBeDefined();
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0].field).toBe('email');
      expect(body.errors[1].field).toBe('password');
    });

    it('should handle non-operational AppError (programming error)', async () => {
      // Create a concrete error class for testing
      class ProgrammingError extends AppError {
        readonly statusCode = 500;
        readonly isOperational = false;
        constructor(message: string) {
          super(message);
        }
      }

      app.get('/programming-error', async () => {
        throw new ProgrammingError('Programming error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/programming-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      // Non-operational errors still return their message via the error handler
      expect(body.message).toBe('Programming error');
    });
  });

  describe('Zod validation error handling', () => {
    it('should handle ZodError with field details', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      app.get('/zod-error', async () => {
        // This will throw a ZodError
        schema.parse({ email: 'invalid', age: 15 });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/zod-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should handle ZodError with nested path', async () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string().min(1),
          }),
        }),
      });

      app.get('/zod-nested', async () => {
        schema.parse({ user: { profile: { name: '' } } });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/zod-nested',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      // Path should be joined with dots
      expect(body.errors[0].field).toBe('user.profile.name');
    });
  });

  describe('404 Not Found handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Route not found');
    });

    it('should return 404 for unknown POST routes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });
  });

  describe('unexpected error handling', () => {
    it('should handle plain Error objects', async () => {
      app.get('/plain-error', async () => {
        throw new Error('Something went wrong');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/plain-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('error communicating with the MoarTube node');
    });

    it('should handle TypeError', async () => {
      app.get('/type-error', async () => {
        const obj: unknown = null;
        // This will throw TypeError
        return (obj as { prop: string }).prop;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/type-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });

    it('should handle thrown strings', async () => {
      app.get('/string-error', async () => {
        throw 'string error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/string-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });
  });

  describe('HTTP status code error handling', () => {
    it('should handle Fastify errors with status codes < 500', async () => {
      app.get('/fastify-error', async (_request, reply) => {
        // Simulate a Fastify error with status code
        const error = new Error('Method not allowed') as Error & { statusCode: number };
        error.statusCode = 405;
        throw error;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/fastify-error',
      });

      expect(response.statusCode).toBe(405);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Method not allowed');
    });

    it('should handle 429 Too Many Requests', async () => {
      app.get('/rate-limit', async () => {
        const error = new Error('Too many requests') as Error & { statusCode: number };
        error.statusCode = 429;
        throw error;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/rate-limit',
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });
  });

  describe('response format consistency', () => {
    it('should always include isError: true in error responses', async () => {
      app.get('/error-format', async () => {
        throw new BadRequestError('Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/error-format',
      });

      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(typeof body.message).toBe('string');
    });

    it('should not leak stack traces in production errors', async () => {
      app.get('/no-stack', async () => {
        throw new Error('Internal error with sensitive stack');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/no-stack',
      });

      const body = JSON.parse(response.body);
      expect(body.stack).toBeUndefined();
      expect(body.message).not.toContain('at ');
    });
  });

  describe('Fastify validation error handling', () => {
    it('should handle Fastify schema validation error with instancePath', async () => {
      app.post('/fastify-validation', {
        schema: {
          body: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', format: 'email' },
              age: { type: 'number', minimum: 18 },
            },
          },
        },
        handler: async () => {
          return { success: true };
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/fastify-validation',
        payload: { email: 'invalid-email', age: 15 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toBeDefined();
    });

    it('should handle Fastify schema validation error with missing required property', async () => {
      app.post('/fastify-validation-missing', {
        schema: {
          body: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: { type: 'string' },
              password: { type: 'string' },
            },
          },
        },
        handler: async () => {
          return { success: true };
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/fastify-validation-missing',
        payload: { username: 'test' }, // missing password
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toBeDefined();
      // Should include the missing property name
      expect(body.errors.some((e: { field: string }) => e.field === 'password')).toBe(true);
    });

    it('should handle Fastify schema validation error with nested path', async () => {
      app.post('/fastify-validation-nested', {
        schema: {
          body: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  age: { type: 'number' },
                },
              },
            },
          },
        },
        handler: async () => {
          return { success: true };
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/fastify-validation-nested',
        payload: { user: { age: 'not-a-number' } },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.errors).toBeDefined();
      // Path should be converted from /user/age to user.age
      expect(body.errors.some((e: { field: string }) => e.field.includes('user'))).toBe(true);
    });

    it('should fallback to "unknown" field when no path or missingProperty', async () => {
      // Manually throw a validation-like error with minimal data
      app.get('/fastify-validation-minimal', async () => {
        const error = new Error('Validation error') as Error & {
          validation: Array<{ instancePath?: string; params?: { missingProperty?: string }; message?: string }>;
        };
        error.validation = [
          { params: {} }, // No instancePath at all, no missingProperty
        ];
        throw error;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/fastify-validation-minimal',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Validation failed');
      expect(body.errors).toBeDefined();
      expect(body.errors[0].field).toBe('unknown');
      expect(body.errors[0].message).toBe('Validation error');
    });

    it('should fallback to "Validation error" message when message is undefined', async () => {
      app.get('/fastify-validation-no-message', async () => {
        const error = new Error('Validation error') as Error & {
          validation: Array<{ instancePath?: string; params?: { missingProperty?: string }; message?: string }>;
        };
        error.validation = [
          { instancePath: '/field', message: undefined }, // No message
        ];
        throw error;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/fastify-validation-no-message',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].field).toBe('field');
      expect(body.errors[0].message).toBe('Validation error');
    });
  });
});
