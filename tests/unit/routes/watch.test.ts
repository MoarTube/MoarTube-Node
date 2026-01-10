/**
 * Watch Routes Tests
 *
 * Tests for main video watch page route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchRoutes } from '@routes/watch.js';
import type { Container } from '@core/container.js';

describe('Watch Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};
  const mockLinksService = {};
  const mockMonetizationService = {};
  const mockCommentsService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'linksService') return mockLinksService;
      if (serviceName === 'monetizationService') return mockMonetizationService;
      if (serviceName === 'commentsService') return mockCommentsService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve videosService from container', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve linksService from container', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('linksService');
  });

  it('should resolve monetizationService from container', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('monetizationService');
  });

  it('should resolve commentsService from container', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('commentsService');
  });

  it('should register GET / route', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    watchRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });
});
