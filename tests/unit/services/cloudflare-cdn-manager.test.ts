import { describe, expect, it, vi } from 'vitest';
import { CloudflareTunnelManager } from '@/services/cloudflare-tunnel.js';
import type { TunnelSettings } from '@/types/cloudflare-tunnel.js';

describe('CDN lifecycle manager transitions', () => {
  it('reconciles quick to named to quick and restores DNS without stopping the connector prematurely', async () => {
    let settings: TunnelSettings = {
      isCloudflareCdnEnabled: false,
      isCloudflareTunnelEnabled: true,
      cloudflareEmailAddress: 'email',
      cloudflareZoneId: 'zone',
      cloudflareGlobalApiKey: 'key',
      publicNodeAddress: 'node.example.com',
      nodeListeningPort: 9090,
    };
    const stopped = vi.fn(async () => {});
    let created = 0;
    const driver = {
      verify: vi.fn(async () => {}),
      launch: vi.fn(() => ({
        ready: Promise.resolve({ publicUrl: `https://generated-${++created}.trycloudflare.com` }),
        stop: stopped,
      })),
    };
    const restoreRoutes = vi.fn(async () => {});
    const manager = new CloudflareTunnelManager({
      settings: () => ({ ...settings }),
      saveQuickName: async (name) => {
        settings.cloudflareTunnelName = name;
      },
      provision: vi.fn(async () => ({
        token: 'private-token',
        publicUrl: 'https://node.example.com',
      })),
      driver,
      restoreRoutes,
      report: vi.fn(),
      retryDelays: [],
    });
    expect((await manager.start()).mode).toBe('quick');
    expect(settings.cloudflareTunnelName).toBe('generated-1');
    settings = { ...settings, isCloudflareCdnEnabled: true, cloudflareTunnelName: 'Modal Name' };
    expect(await manager.reconcile()).toMatchObject({
      mode: 'named',
      name: 'Modal Name',
      status: 'running',
    });
    expect(stopped).toHaveBeenCalledTimes(1);
    await manager.prepareCdnClear();
    expect(restoreRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ cloudflareGlobalApiKey: 'key' }),
      expect.any(AbortSignal)
    );
    expect(stopped).toHaveBeenCalledTimes(1);
    settings = { ...settings, isCloudflareCdnEnabled: false, cloudflareGlobalApiKey: '' };
    expect((await manager.reconcile()).mode).toBe('quick');
    expect(settings.cloudflareTunnelName).toBe('generated-3');
    await manager.shutdown();
  });
  it('keeps an active connector unchanged and sanitizes restoration failures', async () => {
    const stop = vi.fn(async () => {});
    const manager = new CloudflareTunnelManager({
      settings: () => ({
        isCloudflareCdnEnabled: true,
        cloudflareTunnelName: 'named',
        cloudflareEmailAddress: 'email',
        cloudflareZoneId: 'zone',
        cloudflareGlobalApiKey: 'key',
        publicNodeAddress: 'node.example.com',
        nodeListeningPort: 9090,
      }),
      saveQuickName: vi.fn(),
      provision: async () => ({ token: 'private', publicUrl: 'https://node.example.com' }),
      driver: { verify: async () => {}, launch: () => ({ ready: Promise.resolve({}), stop }) },
      restoreRoutes: async () => {
        throw new Error('private-key');
      },
      report: vi.fn(),
      retryDelays: [],
    });
    await manager.start();
    await expect(manager.prepareCdnClear()).rejects.toThrow('DNS routes could not be restored');
    expect(manager.snapshot().status).toBe('running');
    expect(stop).not.toHaveBeenCalled();
    await manager.shutdown();
  });
});
