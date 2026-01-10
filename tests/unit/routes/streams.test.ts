/**
 * Streams Routes Tests
 *
 * Tests for live streaming route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamsRoutes } from '@routes/streams.js';
import type { Container } from '@core/container.js';

describe('Streams Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};
  const mockLiveChatService = {};
  const mockStreamsService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'liveChatService') return mockLiveChatService;
      if (serviceName === 'streamsService') return mockStreamsService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve videosService from container', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve liveChatService from container', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('liveChatService');
  });

  it('should resolve streamsService from container', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('streamsService');
  });

  // Stream Lifecycle
  it('should register POST /start route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/start', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/stop route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/stop', expect.anything(), expect.any(Function));
  });

  // Stream Segments
  it('should register POST /:videoId/adaptive/:format/:resolution/segments/remove route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/adaptive/:format/:resolution/segments/remove', expect.anything(), expect.any(Function));
  });

  // Stream Monitoring
  it('should register GET /:videoId/bandwidth route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/bandwidth', expect.anything(), expect.any(Function));
  });

  // Chat Settings
  it('should register POST /:videoId/chat/settings route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/chat/settings', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/chat/history route', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/chat/history', expect.anything(), expect.any(Function));
  });

  it('should register exactly 2 GET routes', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(2);
  });

  it('should register exactly 4 POST routes', () => {
    streamsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(4);
  });
});
