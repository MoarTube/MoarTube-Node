import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({ requestTunnelOperation: request }));
import { SettingsController } from '@/controllers/settings.js';

afterEach(() => vi.clearAllMocks());

describe('tunnel status response', () => {
  it('returns an uncached safe snapshot without initiating reconciliation', async () => {
    const app = Fastify();
    const controller = new SettingsController({} as never, {} as never, {} as never, {} as never);
    app.get('/status', controller.getCloudflareTunnel);
    const tunnel = { mode: 'quick', status: 'running', name: 'generated' };
    request.mockResolvedValue(tunnel);
    try {
      const response = await app.inject('/status');
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ isError: false, tunnel });
      expect(request).toHaveBeenCalledExactlyOnceWith('snapshot');
    } finally {
      await app.close();
    }
  });

  it('reports unavailable IPC without echoing internal errors or secrets', async () => {
    const app = Fastify();
    const controller = new SettingsController({} as never, {} as never, {} as never, {} as never);
    app.get('/status', controller.getCloudflareTunnel);
    request.mockRejectedValue(new Error('private-token'));
    try {
      const response = await app.inject('/status');
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('private-token');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });
});
