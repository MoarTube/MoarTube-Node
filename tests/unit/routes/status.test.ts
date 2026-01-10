/**
 * Status Routes Tests
 *
 * Tests for status and health check route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusRoutes } from '@routes/status.js';
import type { Container } from '@core/container.js';

describe('Status Routes', () => {
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
    statusRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should register GET /information route', () => {
    statusRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/information', expect.anything(), expect.any(Function));
  });

  it('should register GET /heartbeat route', () => {
    statusRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/heartbeat', expect.anything(), expect.any(Function));
  });

  it('should register exactly 2 GET routes', () => {
    statusRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(2);
  });
});
