/**
 * External Resources Routes Tests
 *
 * Tests for serving static assets route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { externalResourcesRoutes } from '@routes/external-resources.js';

describe('External Resources Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    optionalAuthenticate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register GET /javascript/:filename route', () => {
    externalResourcesRoutes(mockFastify as any);
    expect(mockFastify.get).toHaveBeenCalledWith('/javascript/:filename', expect.anything(), expect.any(Function));
  });

  it('should register GET /css/:filename route', () => {
    externalResourcesRoutes(mockFastify as any);
    expect(mockFastify.get).toHaveBeenCalledWith('/css/:filename', expect.anything(), expect.any(Function));
  });

  it('should register GET /fonts/:filename route', () => {
    externalResourcesRoutes(mockFastify as any);
    expect(mockFastify.get).toHaveBeenCalledWith('/fonts/:filename', expect.anything(), expect.any(Function));
  });

  it('should register GET /images/:imageName route', () => {
    externalResourcesRoutes(mockFastify as any);
    expect(mockFastify.get).toHaveBeenCalledWith('/images/:imageName', expect.anything(), expect.any(Function));
  });

  it('should register exactly 4 GET routes', () => {
    externalResourcesRoutes(mockFastify as any);
    expect(mockFastify.get).toHaveBeenCalledTimes(4);
  });
});
