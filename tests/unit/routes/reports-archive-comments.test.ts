/**
 * Reports Archive Comments Routes Tests
 *
 * Tests for archived comment report route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsArchiveCommentsRoutes } from '@routes/reports-archive-comments.js';
import type { Container } from '@core/container.js';

describe('Reports Archive Comments Routes', () => {
  const mockFastify = {
    get: vi.fn(),
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
    reportsArchiveCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should register GET / route', () => {
    reportsArchiveCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  it('should register DELETE /:archiveId/delete route', () => {
    reportsArchiveCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledWith('/:archiveId/delete', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    reportsArchiveCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 1 DELETE route', () => {
    reportsArchiveCommentsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.delete).toHaveBeenCalledTimes(1);
  });
});
