/**
 * Unit tests for Authentication Plugin
 *
 * Tests JWT-based authentication for Fastify including
 * token extraction, verification, and authentication hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    jwtSecret: 'test-jwt-secret-key-for-testing',
  }),
}));

// Import after mocking
import authenticationPlugin from '@plugins/authentication.js';
import errorHandlerPlugin from '@plugins/error-handler.js';

describe('Authentication Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(authenticationPlugin);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('plugin registration', () => {
    it('should register authentication decorators on Fastify instance', () => {
      expect(app.authenticate).toBeDefined();
      expect(typeof app.authenticate).toBe('function');
      expect(app.optionalAuthenticate).toBeDefined();
      expect(typeof app.optionalAuthenticate).toBe('function');
    });

    it('should decorate request with authentication properties', async () => {
      // Add a test route to check request properties
      app.get('/test', async (request) => {
        return {
          hasIsAuthenticated: 'isAuthenticated' in request,
          hasUsername: 'username' in request,
          hasJwtToken: 'jwtToken' in request,
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const body = JSON.parse(response.body);
      expect(body.hasIsAuthenticated).toBe(true);
      expect(body.hasUsername).toBe(true);
      expect(body.hasJwtToken).toBe(true);
    });
  });

  describe('authenticate hook', () => {
    beforeEach(() => {
      // Add a protected route using authenticate
      app.get('/protected', {
        preHandler: app.authenticate,
        handler: async (request) => {
          return {
            isAuthenticated: request.isAuthenticated,
            username: request.username,
          };
        },
      });
    });

    it('should authenticate request with valid Bearer token', async () => {
      const token = jwt.sign({ username: 'testuser' }, 'test-jwt-secret-key-for-testing');

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAuthenticated).toBe(true);
      expect(body.username).toBe('testuser');
    });

    it('should reject request without Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Authentication required');
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Invalid or expired token');
    });

    it('should reject request with expired token', async () => {
      const token = jwt.sign(
        { username: 'testuser' },
        'test-jwt-secret-key-for-testing',
        { expiresIn: '-1h' } // Already expired
      );

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
      expect(body.message).toBe('Invalid or expired token');
    });

    it('should reject request with token signed by wrong secret', async () => {
      const token = jwt.sign({ username: 'testuser' }, 'wrong-secret');

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.isError).toBe(true);
    });

    it('should reject request with non-Bearer authorization scheme', async () => {
      const token = jwt.sign({ username: 'testuser' }, 'test-jwt-secret-key-for-testing');

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Basic ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle token with additional payload fields', async () => {
      const token = jwt.sign(
        { username: 'testuser', role: 'admin', customField: 'value' },
        'test-jwt-secret-key-for-testing'
      );

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('testuser');
    });
  });

  describe('optionalAuthenticate hook', () => {
    beforeEach(() => {
      // Add a route using optionalAuthenticate
      app.get('/optional', {
        preHandler: app.optionalAuthenticate,
        handler: async (request) => {
          return {
            isAuthenticated: request.isAuthenticated,
            username: request.username ?? null,
            hasToken: request.jwtToken !== undefined,
          };
        },
      });
    });

    it('should authenticate request with valid token', async () => {
      const token = jwt.sign({ username: 'testuser' }, 'test-jwt-secret-key-for-testing');

      const response = await app.inject({
        method: 'GET',
        url: '/optional',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAuthenticated).toBe(true);
      expect(body.username).toBe('testuser');
      expect(body.hasToken).toBe(true);
    });

    it('should allow request without token (unauthenticated)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/optional',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAuthenticated).toBe(false);
      expect(body.username).toBeNull();
      expect(body.hasToken).toBe(false);
    });

    it('should not authenticate request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/optional',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAuthenticated).toBe(false);
    });

    it('should not authenticate request with expired token', async () => {
      const token = jwt.sign(
        { username: 'testuser' },
        'test-jwt-secret-key-for-testing',
        { expiresIn: '-1h' }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/optional',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAuthenticated).toBe(false);
    });
  });

  describe('token extraction', () => {
    beforeEach(() => {
      app.get('/check-token', {
        preHandler: app.optionalAuthenticate,
        handler: async (request) => {
          return { token: request.jwtToken ?? null };
        },
      });
    });

    it('should extract token from Bearer authorization header', async () => {
      const token = jwt.sign({ username: 'test' }, 'test-jwt-secret-key-for-testing');

      const response = await app.inject({
        method: 'GET',
        url: '/check-token',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.token).toBe(token);
    });

    it('should return null token when no authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/check-token',
      });

      const body = JSON.parse(response.body);
      expect(body.token).toBeNull();
    });

    it('should handle empty authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/check-token',
        headers: {
          authorization: '',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.token).toBeNull();
    });
  });
});
