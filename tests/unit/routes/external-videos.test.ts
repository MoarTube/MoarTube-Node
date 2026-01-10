/**
 * External Videos Routes Tests
 *
 * Tests for serving video content route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { externalVideosRoutes } from '@routes/external-videos.js';
import type { Container } from '@core/container.js';

describe('External Videos Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve videosService from container', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should register GET /baseUrl route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/baseUrl', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/images/thumbnail.jpg route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/images/thumbnail.jpg', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/images/preview.jpg route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/images/preview.jpg', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/images/poster.jpg route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/images/poster.jpg', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/adaptive/:format/:type/manifests/:manifestName route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/adaptive/:format/:type/manifests/:manifestName', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/adaptive/:format/:resolution/segments/:segmentName route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/adaptive/:format/:resolution/segments/:segmentName', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/progressive/:format/:progressiveFilename route', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/progressive/:format/:progressiveFilename', expect.anything(), expect.any(Function));
  });

  it('should register exactly 7 GET routes', () => {
    externalVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(7);
  });
});
