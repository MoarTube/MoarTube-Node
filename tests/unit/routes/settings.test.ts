/**
 * Settings Routes Tests
 *
 * Tests for node settings and configuration route registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsRoutes } from '@routes/settings.js';
import type { Container } from '@core/container.js';

describe('Settings Routes', () => {
  it('requires authentication and a strict boolean for the network access setting', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    const route = mockFastify.post.mock.calls.find(([url]) => url === '/network/access');
    expect(route).toBeDefined();
    expect(route![1].preHandler).toEqual([mockFastify.authenticate]);
    const schema = route![1].schema.body;
    expect(schema.safeParse({ allowRemoteConnections: false }).success).toBe(true);
    expect(schema.safeParse({ allowRemoteConnections: 'false' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ allowRemoteConnections: true, host: 'other' }).success).toBe(false);
  });

  it('does not register the retired Node ID endpoint', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post.mock.calls.map(([route]) => route)).not.toContain('/personalize/id');
  });
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

  it('requires authentication for the metrics bundle', () => {
    settingsRoutes(mockFastify as never, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/metrics',
      { preHandler: [mockFastify.authenticate], schema: { tags: ['Settings'] } }, expect.any(Function));
  });

  it('requires authentication for storage metrics', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/metrics/disk',
      { preHandler: [mockFastify.authenticate], schema: { tags: ['Settings'] } }, expect.any(Function));
  });

  it('requires authentication for RAM metrics', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/metrics/memory',
      { preHandler: [mockFastify.authenticate], schema: { tags: ['Settings'] } }, expect.any(Function));
  });

  it('requires authentication for CPU metrics', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/metrics/cpu',
      { preHandler: [mockFastify.authenticate], schema: { tags: ['Settings'] } }, expect.any(Function));
  });

  // Settings Root
  it('requires authentication for credential-free tunnel status', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledWith('/cloudflare/tunnel',
      { preHandler: [mockFastify.authenticate], schema: { tags: ['Settings'] } }, expect.any(Function));
  });

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

  it('should register POST /personalize/headline route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/personalize/headline', expect.anything(), expect.any(Function));
  });

  it('should register POST /personalize/about route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/personalize/about', expect.anything(), expect.any(Function));
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

  it('requires authentication for storage migration', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith(
      '/storage/migrate',
      expect.objectContaining({ preHandler: [mockFastify.authenticate] }),
      expect.any(Function)
    );
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

  it('should register POST /restart route', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledWith('/restart', expect.anything(), expect.any(Function));
  });

  it('should register exactly 10 GET routes', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.get).toHaveBeenCalledTimes(10);
  });

  it('should register exactly 30 POST routes', () => {
    settingsRoutes(mockFastify as any, mockContainer);
    expect(mockFastify.post).toHaveBeenCalledTimes(30);
  });
});
