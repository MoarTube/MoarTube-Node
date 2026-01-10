/**
 * Reports Videos Routes Tests
 *
 * Tests for video report management route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsVideosRoutes } from '@routes/reports-videos.js';
import type { Container } from '@core/container.js';

describe('Reports Videos Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockReportsService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'reportsService') return mockReportsService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve reportsService from container', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should register GET / route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  it('should register POST /archive route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/archive', expect.anything(), expect.any(Function));
  });

  it('should register DELETE /:reportId/delete route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledWith('/:reportId/delete', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 POST route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 DELETE route', () => {
    reportsVideosRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledTimes(1);
  });
});
