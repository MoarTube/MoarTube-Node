/**
 * Routes Index Tests
 *
 * Tests for the route registration and exports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all route modules
vi.mock('@routes/status.js', () => ({
  statusRoutes: vi.fn(),
}));

vi.mock('@routes/account.js', () => ({
  accountRoutes: vi.fn(),
}));

vi.mock('@routes/videos.js', () => ({
  videosRoutes: vi.fn(),
}));

vi.mock('@routes/base.js', () => ({
  baseRoutes: vi.fn(),
}));

vi.mock('@routes/links.js', () => ({
  linksRoutes: vi.fn(),
}));

vi.mock('@routes/monetization.js', () => ({
  monetizationRoutes: vi.fn(),
}));

vi.mock('@routes/watch-embed.js', () => ({
  watchEmbedRoutes: vi.fn(),
}));

vi.mock('@routes/external-resources.js', () => ({
  externalResourcesRoutes: vi.fn(),
}));

vi.mock('@routes/external-videos.js', () => ({
  externalVideosRoutes: vi.fn(),
}));

vi.mock('@routes/comments.js', () => ({
  commentsRoutes: vi.fn(),
}));

vi.mock('@routes/watch.js', () => ({
  watchRoutes: vi.fn(),
}));

vi.mock('@routes/node.js', () => ({
  nodeRoutes: vi.fn(),
}));

vi.mock('@routes/reports.js', () => ({
  reportsRoutes: vi.fn(),
}));

vi.mock('@routes/reports-videos.js', () => ({
  reportsVideosRoutes: vi.fn(),
}));

vi.mock('@routes/reports-comments.js', () => ({
  reportsCommentsRoutes: vi.fn(),
}));

vi.mock('@routes/reports-archive-videos.js', () => ({
  reportsArchiveVideosRoutes: vi.fn(),
}));

vi.mock('@routes/reports-archive-comments.js', () => ({
  reportsArchiveCommentsRoutes: vi.fn(),
}));

vi.mock('@routes/settings.js', () => ({
  settingsRoutes: vi.fn(),
}));

vi.mock('@routes/streams.js', () => ({
  streamsRoutes: vi.fn(),
}));

describe('Routes Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exports', () => {
    it('should export all route functions', async () => {
      const routes = await import('@routes/index.js');

      expect(routes.statusRoutes).toBeDefined();
      expect(routes.accountRoutes).toBeDefined();
      expect(routes.videosRoutes).toBeDefined();
      expect(routes.baseRoutes).toBeDefined();
      expect(routes.linksRoutes).toBeDefined();
      expect(routes.monetizationRoutes).toBeDefined();
      expect(routes.watchEmbedRoutes).toBeDefined();
      expect(routes.externalResourcesRoutes).toBeDefined();
      expect(routes.externalVideosRoutes).toBeDefined();
      expect(routes.commentsRoutes).toBeDefined();
      expect(routes.watchRoutes).toBeDefined();
      expect(routes.nodeRoutes).toBeDefined();
      expect(routes.reportsRoutes).toBeDefined();
      expect(routes.reportsVideosRoutes).toBeDefined();
      expect(routes.reportsCommentsRoutes).toBeDefined();
      expect(routes.reportsArchiveVideosRoutes).toBeDefined();
      expect(routes.reportsArchiveCommentsRoutes).toBeDefined();
      expect(routes.settingsRoutes).toBeDefined();
      expect(routes.streamsRoutes).toBeDefined();
    });

    it('should export registerRoutes function', async () => {
      const routes = await import('@routes/index.js');

      expect(routes.registerRoutes).toBeDefined();
      expect(typeof routes.registerRoutes).toBe('function');
    });
  });

  describe('registerRoutes', () => {
    it('should register base routes without prefix', async () => {
      const { registerRoutes, baseRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(baseRoutes).toHaveBeenCalledWith(mockFastify);
    });

    it('should register status routes with /status prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/status' }
      );
    });

    it('should register account routes with /account prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/account' }
      );
    });

    it('should register videos routes with /videos prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/videos' }
      );
    });

    it('should register links routes with /links prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/links' }
      );
    });

    it('should register monetization routes with /monetization prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/monetization' }
      );
    });

    it('should register watch embed routes with /watch/embed prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/watch/embed' }
      );
    });

    it('should register external resources routes with /external/resources prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/external/resources' }
      );
    });

    it('should register external videos routes with /external/videos prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/external/videos' }
      );
    });

    it('should register comments routes with /comments prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/comments' }
      );
    });

    it('should register watch routes with /watch prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/watch' }
      );
    });

    it('should register node routes with /node prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/node' }
      );
    });

    it('should register reports routes with /reports prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/reports' }
      );
    });

    it('should register reports videos routes with /reports/videos prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/reports/videos' }
      );
    });

    it('should register reports comments routes with /reports/comments prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/reports/comments' }
      );
    });

    it('should register reports archive videos routes with /reports/archive/videos prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/reports/archive/videos' }
      );
    });

    it('should register reports archive comments routes with /reports/archive/comments prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/reports/archive/comments' }
      );
    });

    it('should register settings routes with /settings prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/settings' }
      );
    });

    it('should register streams routes with /streams prefix', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.any(Function),
        { prefix: '/streams' }
      );
    });

    it('should invoke route handlers with type provider', async () => {
      const { registerRoutes, statusRoutes } = await import('@routes/index.js');

      const mockTypeProviderInstance = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      };
      
      const mockFastify = createMockFastify();
      mockFastify.register.mockImplementation((handler: (instance: any) => void, opts: any) => {
        // Simulate Fastify calling the registered handler
        const mockInstance = {
          withTypeProvider: () => mockTypeProviderInstance,
        };
        handler(mockInstance);
      });

      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      // The statusRoutes should have been called with the type provider instance
      expect(statusRoutes).toHaveBeenCalled();
    });

    it('should register all 18 prefixed routes plus base routes', async () => {
      const { registerRoutes } = await import('@routes/index.js');

      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      registerRoutes(mockFastify as any, mockContainer);

      // 18 prefixed routes (status, account, videos, links, monetization, 
      // watch-embed, external-resources, external-videos, comments, watch, 
      // node, reports, reports-videos, reports-comments, reports-archive-videos,
      // reports-archive-comments, settings, streams)
      expect(mockFastify.register).toHaveBeenCalledTimes(18);
    });
  });

  describe('Route Handler Invocation', () => {
    it('should call route handler with container for routes that need it', async () => {
      const { registerRoutes, accountRoutes } = await import('@routes/index.js');

      const mockTypeProviderInstance = {};
      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      // Capture the handler for account routes
      mockFastify.register.mockImplementation((handler: (instance: any) => void, opts: any) => {
        if (opts.prefix === '/account') {
          const mockInstance = {
            withTypeProvider: () => mockTypeProviderInstance,
          };
          handler(mockInstance);
        }
      });

      registerRoutes(mockFastify as any, mockContainer);

      expect(accountRoutes).toHaveBeenCalledWith(mockTypeProviderInstance, mockContainer);
    });

    it('should call external resources route handler without container', async () => {
      const { registerRoutes, externalResourcesRoutes } = await import('@routes/index.js');

      const mockTypeProviderInstance = {};
      const mockFastify = createMockFastify();
      const mockContainer = createMockContainer();

      // Capture the handler for external-resources routes
      mockFastify.register.mockImplementation((handler: (instance: any) => void, opts: any) => {
        if (opts.prefix === '/external/resources') {
          const mockInstance = {
            withTypeProvider: () => mockTypeProviderInstance,
          };
          handler(mockInstance);
        }
      });

      registerRoutes(mockFastify as any, mockContainer);

      // externalResourcesRoutes is called without container
      expect(externalResourcesRoutes).toHaveBeenCalledWith(mockTypeProviderInstance);
    });
  });
});

// Helper functions
function createMockFastify() {
  return {
    register: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    withTypeProvider: vi.fn(() => ({})),
  };
}

function createMockContainer() {
  return {
    resolve: vi.fn((name: string) => ({ name })),
  };
}
