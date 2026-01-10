/**
 * Reports Routes Tests
 *
 * Tests for report count route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsRoutes } from '@routes/reports.js';
import type { Container } from '@core/container.js';

describe('Reports Routes', () => {
  const mockFastify = {
    get: vi.fn(),
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
    reportsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('reportsService');
  });

  it('should register GET /count route', () => {
    reportsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/count', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    reportsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });
});
