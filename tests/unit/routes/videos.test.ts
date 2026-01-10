/**
 * Videos Routes Tests
 *
 * Tests for video management route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { videosRoutes } from '@routes/videos.js';
import type { Container } from '@core/container.js';

describe('Videos Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockVideosService = {};
  const mockCommentsService = {};
  const mockVideoUploadService = {};
  const mockCloudflareService = {};
  const mockReportsService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'commentsService') return mockCommentsService;
      if (serviceName === 'videoUploadService') return mockVideoUploadService;
      if (serviceName === 'cloudflareService') return mockCloudflareService;
      if (serviceName === 'reportsService') return mockReportsService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve videosService from container', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve commentsService from container', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('commentsService');
  });

  it('should resolve videoUploadService from container', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videoUploadService');
  });

  it('should resolve cloudflareService from container', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
  });

  it('should resolve reportsService from container', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  // Public Endpoints
  it('should register GET /search route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/search', expect.anything(), expect.any(Function));
  });

  it('should register GET /recommended route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/recommended', expect.anything(), expect.any(Function));
  });

  it('should register GET /tags route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/tags', expect.anything(), expect.any(Function));
  });

  it('should register GET /tags/all route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/tags/all', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/comments route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/comments', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/comments/:commentId route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/comments/:commentId', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/alias route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/alias', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/watch route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/watch', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/permissions route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/permissions', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/data route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/data', expect.anything(), expect.any(Function));
  });

  it('should register GET /data/all route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/data/all', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/views/increment route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/views/increment', expect.anything(), expect.any(Function));
  });

  // Public POST endpoints
  it('should register POST /:videoId/like route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/like', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/dislike route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/dislike', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/comments/comment route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/comments/comment', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/report route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/report', expect.anything(), expect.any(Function));
  });

  // Protected Endpoints
  it('should register POST /delete route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/delete', expect.anything(), expect.any(Function));
  });

  it('should register POST /finalize route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/finalize', expect.anything(), expect.any(Function));
  });

  it('should register POST /import route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/import', expect.anything(), expect.any(Function));
  });

  it('should register POST /imported route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/imported', expect.anything(), expect.any(Function));
  });

  it('should register POST /publishing route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/publishing', expect.anything(), expect.any(Function));
  });

  it('should register POST /published route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/published', expect.anything(), expect.any(Function));
  });

  it('should register POST /error route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/error', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/data route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/data', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/lengths route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/lengths', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/index/outdated route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/index/outdated', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/adaptive/m3u8/:manifestType/manifests/masterManifest route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/adaptive/m3u8/:manifestType/manifests/masterManifest', expect.anything(), expect.any(Function));
  });

  it('should register DELETE /:videoId/comments/:commentId/delete route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledWith('/:videoId/comments/:commentId/delete', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/permissions route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/permissions', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/upload route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/upload', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/stream route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/stream', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/images/thumbnail route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/images/thumbnail', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/images/preview route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/images/preview', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/images/poster route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/images/poster', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/publishing/stop route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/publishing/stop', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/importing/stop route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/importing/stop', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/sourceFileExtension route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/sourceFileExtension', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/sourceFileExtension route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/sourceFileExtension', expect.anything(), expect.any(Function));
  });

  it('should register GET /:videoId/publishes route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/:videoId/publishes', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/unpublish route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/unpublish', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/published route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/published', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/index/add route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/index/add', expect.anything(), expect.any(Function));
  });

  it('should register POST /:videoId/index/remove route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/:videoId/index/remove', expect.anything(), expect.any(Function));
  });

  it('should register exactly 14 GET routes', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(14);
  });

  it('should register exactly 28 POST routes', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(28);
  });

  it('should register exactly 1 DELETE route', () => {
    videosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledTimes(1);
  });
});
