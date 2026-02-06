/**
 * Settings Routes Tests
 *
 * Tests for node settings and configuration route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsRoutes } from '@routes/settings.js';
import type { Container } from '@core/container.js';

describe('Settings Routes', () => {
  const mockFastify = {
    get: vi.fn(),
    post: vi.fn(),
    optionalAuthenticate: vi.fn(),
    authenticate: vi.fn(),
  };

  const mockSettingsService = {};
  const mockVideosService = {};
  const mockCloudflareService = {};
  const mockWebsocketService = {};

  const mockContainer = {
    resolve: vi.fn((serviceName: string) => {
      if (serviceName === 'settingsService') return mockSettingsService;
      if (serviceName === 'videosService') return mockVideosService;
      if (serviceName === 'cloudflareService') return mockCloudflareService;
      if (serviceName === 'websocketService') return mockWebsocketService;
      return {};
    }),
  } as unknown as Container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve settingsService from container', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('settingsService');
  });

  it('should resolve videosService from container', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
  });

  it('should resolve cloudflareService from container', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
  });

  it('should resolve websocketService from container', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockContainer.resolve).toHaveBeenCalledWith('websocketService');
  });

  // Settings Root
  it('should register GET / route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/', expect.anything(), expect.any(Function));
  });

  // Avatar & Banner
  it('should register GET /avatar route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/avatar', expect.anything(), expect.any(Function));
  });

  it('should register POST /avatar route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/avatar', expect.anything(), expect.any(Function));
  });

  it('should register GET /banner route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/banner', expect.anything(), expect.any(Function));
  });

  it('should register POST /banner route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/banner', expect.anything(), expect.any(Function));
  });

  // Personalization
  it('should register POST /personalize/name route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/personalize/name', expect.anything(), expect.any(Function));
  });

  it('should register POST /personalize/about route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/personalize/about', expect.anything(), expect.any(Function));
  });

  it('should register POST /personalize/id route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/personalize/id', expect.anything(), expect.any(Function));
  });

  // Security
  it('should register POST /secure route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/secure', expect.anything(), expect.any(Function));
  });

  it('should register POST /account route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/account', expect.anything(), expect.any(Function));
  });

  // Network Configuration
  it('should register POST /network/internal route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/network/internal', expect.anything(), expect.any(Function));
  });

  it('should register POST /network/external route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/network/external', expect.anything(), expect.any(Function));
  });

  // Cloudflare Configuration
  it('should register POST /cloudflare/configure route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/cloudflare/configure', expect.anything(), expect.any(Function));
  });

  it('should register POST /cloudflare/clear route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/cloudflare/clear', expect.anything(), expect.any(Function));
  });

  it('should register POST /cloudflare/turnstile/configure route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/cloudflare/turnstile/configure', expect.anything(), expect.any(Function));
  });

  it('should register POST /cloudflare/turnstile/clear route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/cloudflare/turnstile/clear', expect.anything(), expect.any(Function));
  });

  // Feature Toggles
  it('should register POST /comments/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/comments/toggle', expect.anything(), expect.any(Function));
  });

  it('should register POST /likes/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/likes/toggle', expect.anything(), expect.any(Function));
  });

  it('should register POST /dislikes/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/dislikes/toggle', expect.anything(), expect.any(Function));
  });

  it('should register POST /reports/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/reports/toggle', expect.anything(), expect.any(Function));
  });

  it('should register POST /liveChat/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/liveChat/toggle', expect.anything(), expect.any(Function));
  });

  // Database & Storage Configuration
  it('should register POST /database/config/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/database/config/toggle', expect.anything(), expect.any(Function));
  });

  it('should register POST /storage/config/toggle route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/storage/config/toggle', expect.anything(), expect.any(Function));
  });

  // Database Import/Export
  it('should register GET /export/database route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/export/database', expect.anything(), expect.any(Function));
  });

  it('should register POST /import/database route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/import/database', expect.anything(), expect.any(Function));
  });

  it('should register exactly 4 GET routes', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(4);
  });

  it('should register exactly 21 POST routes', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(21);
  });
});
