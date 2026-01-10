/**
 * Watch Embed Routes Tests
 *
 * Tests for embedded video and chat page route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchEmbedRoutes } from '@routes/watch-embed.js';
import type { Container } from '@core/container.js';

describe('Watch Embed Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};
  const mockLinksService = {};
  const mockMonetizationService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'linksService') return mockLinksService;
      if (serviceName === 'monetizationService') return mockMonetizationService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve videosService from container', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve linksService from container', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('linksService');
  });

  it('should resolve monetizationService from container', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('monetizationService');
  });

  it('should register GET /video/:videoId route', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/video/:videoId', expect.anything(), expect.any(Function));
  });

  it('should register GET /chat/:videoId route', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/chat/:videoId', expect.anything(), expect.any(Function));
  });

  it('should register exactly 2 GET routes', () => {
    watchEmbedRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(2);
  });
});
