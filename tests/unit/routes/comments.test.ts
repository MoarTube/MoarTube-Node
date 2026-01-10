/**
 * Comments Routes Tests
 *
 * Tests for comment search and reporting route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commentsRoutes } from '@routes/comments.js';
import type { Container } from '@core/container.js';

describe('Comments Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockCommentsService = {};
  const mockReportsService = {};
  const mockVideosService = {};
  const mockCloudflareService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'commentsService') return mockCommentsService;
      if (serviceName === 'reportsService') return mockReportsService;
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'cloudflareService') return mockCloudflareService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve commentsService from container', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('commentsService');
  });

  it('should resolve reportsService from container', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should resolve videosService from container', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve cloudflareService from container', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
  });

  it('should register GET /search route', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/search', expect.anything(), expect.any(Function));
  });

  it('should register POST /:commentId/report route', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:commentId/report', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 POST route', () => {
    commentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(1);
  });
});
