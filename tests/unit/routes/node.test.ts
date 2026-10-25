/**
 * Node Routes Tests
 *
 * Tests for main node page route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { nodeRoutes, nodePageRoutes } from '@routes/node.js';
import { videosRoutes } from '@routes/videos.js';
import type { Container } from '@core/container.js';

describe('Node Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};
  const mockLinksService = {};
  const mockMonetizationService = {};
  const mockStreamsService = {};
  const mockCommentsService = {};
  const mockReportsService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'linksService') return mockLinksService;
      if (serviceName === 'monetizationService') return mockMonetizationService;
      if (serviceName === 'streamsService') return mockStreamsService;
      if (serviceName === 'commentsService') return mockCommentsService;
      if (serviceName === 'reportsService') return mockReportsService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should serve the browsing page alongside existing video APIs and redirect old links', async () => {
    const app = Fastify();
    app.decorate('optionalAuthenticate', async () => {});
    app.decorate('authenticate', async () => {});
    app.setValidatorCompiler(() => () => true);
    app.register(async (instance) => {
      videosRoutes(instance, mockContainer);
      nodePageRoutes(instance, mockContainer);
    }, { prefix: '/videos' });
    app.register(async (instance) => {
      nodeRoutes(instance, mockContainer);
    }, { prefix: '/node' });

    try {
      await app.ready();
      expect(app.hasRoute({ method: 'GET', url: '/videos' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/videos/' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/videos/search' })).toBe(true);
      expect(app.hasRoute({ method: 'GET', url: '/node/search' })).toBe(true);

      for (const path of ['/node', '/node/']) {
        const plainResponse = await app.inject(path);
        expect(plainResponse.statusCode).toBe(301);
        expect(plainResponse.headers.location).toBe('/videos');

        const response = await app.inject(`${path}?searchTerm=cats&sortTerm=latest&tagTerm=fun`);
        expect(response.statusCode).toBe(301);
        expect(response.headers.location).toBe('/videos?searchTerm=cats&sortTerm=latest&tagTerm=fun');
      }
    } finally {
      await app.close();
    }
  });

  it('should resolve videosService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve linksService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('linksService');
  });

  it('should resolve monetizationService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('monetizationService');
  });

  it('should resolve streamsService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('streamsService');
  });

  it('should resolve commentsService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('commentsService');
  });

  it('should resolve reportsService from container', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should register GET / route', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  it('should register GET /search route', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/search', expect.anything(), expect.any(Function));
  });

  it('should register GET /newContentCounts route', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/newContentCounts', expect.anything(), expect.any(Function));
  });

  it('should register POST /contentChecked route', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/contentChecked', expect.anything(), expect.any(Function));
  });

  it('should register exactly 3 GET routes', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(3);
  });

  it('should register exactly 1 POST route', () => {
    nodeRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(1);
  });
});
