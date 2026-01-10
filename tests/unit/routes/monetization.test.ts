/**
 * Monetization Routes Tests
 *
 * Tests for crypto wallet address management route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { monetizationRoutes } from '@routes/monetization.js';
import type { Container } from '@core/container.js';

describe('Monetization Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockMonetizationService = {};
  const mockCloudflareService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'monetizationService') return mockMonetizationService;
      if (serviceName === 'cloudflareService') return mockCloudflareService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve monetizationService from container', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('monetizationService');
  });

  it('should resolve cloudflareService from container', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
  });

  it('should register GET /all route', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/all', expect.anything(), expect.any(Function));
  });

  it('should register POST /add route', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/add', expect.anything(), expect.any(Function));
  });

  it('should register POST /delete route', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/delete', expect.anything(), expect.any(Function));
  });

  it('should register exactly 1 GET route', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(1);
  });

  it('should register exactly 2 POST routes', () => {
    monetizationRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(2);
  });
});
