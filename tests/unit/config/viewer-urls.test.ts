import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({ requestTunnelOperation: vi.fn() }));
import { viewerMediaBase, canonicalNodeOrigin } from '@/utils/viewer-urls.js';
import { NodeSettingsSchema } from '@/config/schema.js';
import type { TunnelSnapshot } from '@/types/cloudflare-tunnel.js';
const stopped: TunnelSnapshot = { mode: 'none', status: 'stopped', name: '' };
const running: TunnelSnapshot = { mode: 'quick', status: 'running', name: 'random-label', publicUrl: 'https://random-label.trycloudflare.com' };
function settings(storage: string, cdn: boolean, tunnel: boolean) {
  return NodeSettingsSchema.parse({ nodeListeningPort: 9090, username: 'hash', password: 'hash', publicNodeProtocol: 'https', publicNodeAddress: 'node.example.com', publicNodePort: 443, databaseConfig: { databaseDialect: 'sqlite' }, isCloudflareCdnEnabled: cdn, isCloudflareTunnelEnabled: tunnel,
    storageConfig: storage === 'filesystem' ? { storageMode: storage } : { storageMode: storage, s3Config: { bucketName: 'externalvideos.node.example.com', s3ProviderClientConfig: { region: 'us-east-1', credentials: { accessKeyId: 'key', secretAccessKey: 'secret' } } } },
  });
}
describe('viewer URL policy matrix', () => {
  for (const storage of ['filesystem', 's3provider']) for (const cdn of [false, true]) for (const tunnel of [false, true]) {
    it(`${storage}, CDN ${cdn}, tunnel ${tunnel}`, () => {
      const config = settings(storage, cdn, tunnel);
      const expected = storage === 'filesystem' ? '' : cdn ? 'https://externalvideos.node.example.com' : 'https://s3.us-east-1.amazonaws.com/externalvideos.node.example.com';
      expect(viewerMediaBase(config)).toBe(expected);
      expect(canonicalNodeOrigin(config, tunnel ? running : stopped)).toBe('https://node.example.com');
    });
  }
  it('preserves custom S3 path-style bucket prefixes without a tunnel dependency', () => {
    const config = settings('s3provider', false, false);
    config.storageConfig.s3Config!.s3ProviderClientConfig.endpoint = 'https://storage.example.com:9443';
    config.storageConfig.s3Config!.s3ProviderClientConfig.forcePathStyle = true;
    expect(viewerMediaBase(config)).toBe('https://storage.example.com:9443/externalvideos.node.example.com');
  });
  it('uses only a ready quick connector when the configured Node address is local', () => {
    const config = settings('filesystem', false, true);
    config.publicNodeProtocol = 'http'; config.publicNodeAddress = 'localhost'; config.publicNodePort = 9090;
    expect(canonicalNodeOrigin(config, running)).toBe(running.publicUrl);
    for (const status of ['starting', 'stopped', 'error'] as const) expect(canonicalNodeOrigin(config, { ...running, status })).toBe('');
    expect(canonicalNodeOrigin({ ...config, isCloudflareTunnelEnabled: false }, running)).toBe('');
    expect(canonicalNodeOrigin(config, { ...running, publicUrl: 'https://evil.example.com' })).toBe('');
  });
  it('does not reflect arbitrary Host or forwarded headers and preserves direct local ports/IPv6', () => {
    const config = settings('filesystem', false, false);
    config.publicNodeAddress = ''; config.publicNodeProtocol = '';
    expect(canonicalNodeOrigin(config, stopped, { headers: { host: 'evil.example.com', 'x-forwarded-host': 'node.example.com', 'x-forwarded-proto': 'https' } })).toBe('');
    expect(canonicalNodeOrigin(config, stopped, { headers: { host: '127.0.0.1:9090' } })).toBe('http://127.0.0.1:9090');
    expect(canonicalNodeOrigin(config, stopped, { headers: { host: '[::1]:9090' } })).toBe('http://[::1]:9090');
    config.publicNodeAddress = '192.168.1.10'; config.publicNodeProtocol = 'http'; config.publicNodePort = 1234;
    expect(canonicalNodeOrigin(config, stopped, { headers: { host: '192.168.1.10:1234' } })).toBe('http://192.168.1.10:1234');
  });
});
