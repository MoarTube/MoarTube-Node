import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({ requestTunnelOperation: vi.fn() }));
import { canonicalNodeOrigin } from '@/utils/viewer-urls.js';
import { NodeSettingsSchema } from '@/config/schema.js';
const config = () =>
  NodeSettingsSchema.parse({
    nodeListeningPort: 9090,
    username: 'hash',
    password: 'hash',
    databaseConfig: { databaseDialect: 'sqlite' },
    storageConfig: { storageMode: 'filesystem' },
    isCloudflareTunnelEnabled: false,
  });
const stopped = { mode: 'none', status: 'stopped', name: '' } as const;

describe('URL audit regressions', () => {
  it('preserves HTTPS for a configured local address with an explicit default port', () => {
    const settings = {
      ...config(),
      publicNodeProtocol: 'https' as const,
      publicNodeAddress: '127.0.0.1',
      publicNodePort: 443,
    };
    expect(canonicalNodeOrigin(settings, stopped, { headers: { host: '127.0.0.1:443' } })).toBe(
      'https://127.0.0.1'
    );
  });
  it('does not advertise an arbitrary private Host as a recognized local Node address', () => {
    const interfaces = vi.spyOn(os, 'networkInterfaces').mockReturnValue({});
    try {
      expect(
        canonicalNodeOrigin(config(), stopped, { headers: { host: '10.253.254.253:9090' } })
      ).toBe('');
    } finally {
      interfaces.mockRestore();
    }
  });
});
