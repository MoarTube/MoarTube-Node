/**
 * Account Routes Tests
 *
 * Tests for Account authentication route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountRoutes } from '@routes/account.js';
import type { Container } from '@core/container.js';

describe('Account Routes', () => {
  // Mock fastify instance
  const mockFastify = {
    post: vi.fn(),
    get: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  // Mock container
  const mockAccountService = {
    signIn: vi.fn(),
    signOut: vi.fn(),
    isAuthenticated: vi.fn(),
  };

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'accountService') return mockAccountService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('accountRoutes', () => {
    it('should export accountRoutes function', () => {
      expect(accountRoutes).toBeDefined();
      expect(typeof accountRoutes).toBe('function');
    });

    it('should have correct function signature (fastify, container)', () => {
      expect(accountRoutes.length).toBe(2);
    });

    it('should resolve accountService from container', () => {
      accountRoutes(mockFastify as any, mockContainer);
      
      expect(mockContainer.resolve).toHaveBeenCalledWith('accountService');
    });

    it('should register POST /signin route', () => {
      accountRoutes(mockFastify as any, mockContainer);
      
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/signin',
        expect.objectContaining({
          preHandler: [mockFastify.optionalAuthenticate],
          schema: expect.objectContaining({
            body: expect.anything(),
          }),
        }),
        expect.any(Function)
      );
    });

    it('should register GET /signout route', () => {
      accountRoutes(mockFastify as any, mockContainer);
      
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/signout',
        expect.objectContaining({
          preHandler: [mockFastify.optionalAuthenticate],
        }),
        expect.any(Function)
      );
    });

    it('should register GET /authenticated route with authenticate preHandler', () => {
      accountRoutes(mockFastify as any, mockContainer);
      
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/authenticated',
        expect.objectContaining({
          preHandler: [mockFastify.authenticate],
        }),
        expect.any(Function)
      );
    });

    it('should register all 3 routes', () => {
      accountRoutes(mockFastify as any, mockContainer);
      
      expect(mockFastify.post).toHaveBeenCalledTimes(1);
      expect(mockFastify.get).toHaveBeenCalledTimes(2);
    });
  });
});
