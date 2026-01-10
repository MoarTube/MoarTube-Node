/**
 * Base Routes Tests
 *
 * Tests for root-level routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Base Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('baseRoutes', () => {
    it('should register GET / route', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      
      baseRoutes(mockFastify as any);

      expect(mockFastify.get).toHaveBeenCalledWith('/', expect.any(Function));
    });

    it('should redirect root path to /node with remaining path', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      const mockRequest = {
        url: '/',
      };

      const mockReply = {
        redirect: vi.fn(),
      };

      await routeHandler!(mockRequest, mockReply);

      expect(mockReply.redirect).toHaveBeenCalledWith('/node');
    });

    it('should redirect root path with query string to /node with query string', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      const mockRequest = {
        url: '/?page=1',
      };

      const mockReply = {
        redirect: vi.fn(),
      };

      await routeHandler!(mockRequest, mockReply);

      // The redirect URL should be /node + everything after the first character
      expect(mockReply.redirect).toHaveBeenCalledWith('/node?page=1');
    });

    it('should handle empty path correctly', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      const mockRequest = {
        url: '/',
      };

      const mockReply = {
        redirect: vi.fn(),
      };

      await routeHandler!(mockRequest, mockReply);

      // Should redirect to /node (removing the first character '/')
      expect(mockReply.redirect).toHaveBeenCalledWith('/node');
    });

    it('should preserve path after root in redirect', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      // If the URL somehow had more path (though this route is only for '/')
      const mockRequest = {
        url: '/some/path',
      };

      const mockReply = {
        redirect: vi.fn(),
      };

      await routeHandler!(mockRequest, mockReply);

      // The handler takes url.substring(1), so /some/path becomes some/path
      // Then prepends /node to get /nodesome/path
      expect(mockReply.redirect).toHaveBeenCalledWith('/nodesome/path');
    });
  });

  describe('Route Handler', () => {
    it('should return a promise (async handler)', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      const mockRequest = { url: '/' };
      const mockReply = { redirect: vi.fn() };

      const result = routeHandler!(mockRequest, mockReply);
      
      // Should be a promise
      expect(result).toBeInstanceOf(Promise);
    });

    it('should call reply.redirect exactly once', async () => {
      const { baseRoutes } = await import('@routes/base.js');

      const mockFastify = createMockFastify();
      let routeHandler: (request: any, reply: any) => Promise<void>;

      mockFastify.get.mockImplementation((path: string, handler: any) => {
        routeHandler = handler;
      });

      baseRoutes(mockFastify as any);

      const mockRequest = { url: '/' };
      const mockReply = { redirect: vi.fn() };

      await routeHandler!(mockRequest, mockReply);

      expect(mockReply.redirect).toHaveBeenCalledTimes(1);
    });
  });
});

// Helper function
function createMockFastify() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    register: vi.fn(),
  };
}
