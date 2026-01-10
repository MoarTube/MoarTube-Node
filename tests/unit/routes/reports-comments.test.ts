/**
 * Reports Comments Routes Tests
 *
 * Tests for comment report management route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsCommentsRoutes } from '@routes/reports-comments.js';
import type { Container } from '@core/container.js';

describe('Reports Comments Routes', () => {
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
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should register GET / route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  it('should register POST /archive route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/archive', expect.anything(), expect.any(Function));
  });

  it('should register DELETE /:reportId/delete route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledWith('/:reportId/delete', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 POST route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 DELETE route', () => {
    reportsCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledTimes(1);
  });
});
