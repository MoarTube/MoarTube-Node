/**
 * Authentication Plugin
 *
 * JWT-based authentication for Fastify.
 * Provides authentication hooks and decorators.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { getConfig } from '@config/index.js';
import { UnauthorizedError } from '@/errors/index.js';

/**
 * JWT payload structure
 */
interface JwtPayload {
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * Extended request with authentication info
 */
declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Whether the current request is authenticated
     */
    isAuthenticated: boolean;

    /**
     * The authenticated user's username (if authenticated)
     */
    username?: string;

    /**
     * The JWT token from the request (if present)
     */
    jwtToken?: string;
  }

  interface FastifyInstance {
    /**
     * Authentication hook - requires authentication
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

    /**
     * Optional authentication hook - sets auth info but doesn't require it
     */
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Extract JWT token from request
 *
 * Checks Authorization header (Bearer token)
 */
function extractToken(request: FastifyRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ') === true) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Verify JWT token
 */
function verifyToken(token: string): { valid: boolean; payload?: JwtPayload } {
  try {
    const config = getConfig();
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    return { valid: true, payload: decoded };
  } catch {
    return { valid: false };
  }
}

/**
 * Authentication plugin
 *
 * Decorates Fastify with authentication hooks.
 */
function authenticationPlugin(fastify: FastifyInstance): void {
  // Decorate request with auth properties
  fastify.decorateRequest('isAuthenticated', false);
  fastify.decorateRequest('username', undefined);
  fastify.decorateRequest('jwtToken', undefined);

  /**
   * Required authentication hook
   * Throws UnauthorizedError if not authenticated
   */
  async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extractToken(request);

    if (token === null) {
      throw new UnauthorizedError('Authentication required');
    }

    const result = verifyToken(token);

    if (!result.valid || result.payload === undefined) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    request.isAuthenticated = true;
    request.username = result.payload.username;
    request.jwtToken = token;
    await Promise.resolve();
  }

  /**
   * Optional authentication hook
   * Sets auth info if token present, but doesn't require authentication
   */
  async function optionalAuthenticate(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const token = extractToken(request);

    if (token === null) {
      request.isAuthenticated = false;
      await Promise.resolve();
      return;
    }

    const result = verifyToken(token);

    if (result.valid && result.payload !== undefined) {
      request.isAuthenticated = true;
      request.username = result.payload.username;
      request.jwtToken = token;
    } else {
      request.isAuthenticated = false;
    }
    await Promise.resolve();
  }

  // Decorate Fastify with authentication hooks
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('optionalAuthenticate', optionalAuthenticate);
}

export default fp(authenticationPlugin, {
  name: 'authentication',
  fastify: '5.x',
});
