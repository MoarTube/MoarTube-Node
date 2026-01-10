/**
 * Node Routes Tests
 *
 * Tests for main node page route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nodeRoutes } from '@routes/node.js';
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
