/**
 * Links Routes Tests
 *
 * Tests for social link management route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linksRoutes } from '@routes/links.js';
import type { Container } from '@core/container.js';

describe('Links Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockLinksService = {};
  const mockCloudflareService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'linksService') return mockLinksService;
      if (serviceName === 'cloudflareService') return mockCloudflareService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve linksService from container', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('linksService');
  });

  it('should resolve cloudflareService from container', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
  });

  it('should register GET /all route', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/all', expect.anything(), expect.any(Function));
  });

  it('should register POST /add route', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/add', expect.anything(), expect.any(Function));
  });

  it('should register POST /delete route', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/delete', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 2 POST routes', () => {
    linksRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(2);
  });
});
