import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudflareTunnelApi,
  TunnelOwnershipStore,
  type TunnelHttp,
} from '@/services/cloudflare-tunnel-api.js';
import type { TunnelSettings } from '@/types/cloudflare-tunnel.js';
import { TunnelRecoveryRequiredError } from '@/utils/tunnel-errors.js';

const account = 'a'.repeat(32);
const zone = 'b'.repeat(32);
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
type RecordValue = { id: string; name: string; type: string; content: string; proxied: boolean };
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-ownership-'));
  directories.push(directory);
  const store = new TunnelOwnershipStore(path.join(directory, 'private.json'));
  const records = new Map<string, RecordValue>();
  const deleted = new Set<string>();
  let created = 0;
  let sequence = 0;
  const settings: TunnelSettings = {
    isCloudflareCdnEnabled: true,
    cloudflareTunnelName: 'first',
    cloudflareEmailAddress: 'email',
    cloudflareZoneId: zone,
    cloudflareGlobalApiKey: 'key',
    publicNodeAddress: 'node.example.com',
    nodeListeningPort: 9090,
    storageConfig: { storageMode: 'filesystem' },
  };
  const request = vi.fn<TunnelHttp['request']>(async (options) => {
    const url = new URL(options.url, 'https://api.test');
    let result: unknown = {};
    if (url.pathname === `/zones/${zone}`)
      result = { name: 'example.com', account: { id: account } };
    else if (url.pathname.endsWith('/cfd_tunnel') && options.method === 'POST')
      result = { id: ++created === 1 ? firstId : secondId };
    else if (url.pathname.endsWith('/token')) result = 'private-token';
    else if (url.pathname.includes('/dns_records')) {
      if (options.method === 'GET') {
        const record = records.get(url.searchParams.get('name') ?? '');
        result = record === undefined ? [] : [record];
      } else if (options.method === 'DELETE') {
        const entry = [...records].find(([, value]) => url.pathname.endsWith('/' + value.id));
        if (entry) records.delete(entry[0]);
      } else {
        const body = options.data as Omit<RecordValue, 'id'>;
        const record = { ...body, id: 'record-' + ++sequence };
        records.set(body.name, record);
        result = record;
      }
    } else if (options.method === 'GET' && url.pathname.includes('/cfd_tunnel/')) {
      const id = url.pathname.split('/').pop() ?? '';
      if (deleted.has(id))
        throw Object.assign(new Error('not found'), { response: { status: 404 } });
      result = { id, deleted_at: null };
    }
    return { data: { success: true, result } };
  });
  return {
    api: new CloudflareTunnelApi(store, { request }),
    store,
    request,
    records,
    deleted,
    settings,
    created: () => created,
  };
}
const provision = (test: ReturnType<typeof setup>) =>
  test.api.provision(test.settings, 'http://127.0.0.1:9090', new AbortController().signal);
const restore = (test: ReturnType<typeof setup>) =>
  test.api.restoreRoutes(test.settings, new AbortController().signal);

describe('owned resource recovery', () => {
  it('requires explicit recovery if both ownership persistence and remote compensation fail', async () => {
    const test = setup();
    const normal = test.request.getMockImplementation();
    if (!normal) throw new Error('Missing HTTP fake');
    test.request.mockImplementation(async (options) => {
      if (options.method === 'DELETE' && options.url.includes('/cfd_tunnel/'))
        throw new Error('provider unavailable');
      return normal(options);
    });
    vi.spyOn(test.store, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(provision(test)).rejects.toBeInstanceOf(TunnelRecoveryRequiredError);
    expect(test.created()).toBe(1);
  });
  it('restores obsolete hostname routes and leaves a later external edit alone', async () => {
    const test = setup();
    test.records.set('node.example.com', {
      id: 'old',
      name: 'node.example.com',
      type: 'A',
      content: '192.0.2.1',
      proxied: true,
    });
    await provision(test);
    test.settings.publicNodeAddress = 'next.example.com';
    await provision(test);
    expect(test.records.get('node.example.com')?.content).toBe('192.0.2.1');
    expect(test.records.has('externalvideos.node.example.com')).toBe(false);
    test.records.set('node.example.com', {
      id: 'external',
      name: 'node.example.com',
      type: 'A',
      content: '192.0.2.99',
      proxied: false,
    });
    await provision(test);
    expect(test.records.get('node.example.com')?.content).toBe('192.0.2.99');
    expect(test.created()).toBe(1);
    expect(
      test.request.mock.calls.some(
        ([options]) => options.method === 'DELETE' && options.url.includes('/cfd_tunnel/')
      )
    ).toBe(false);
  });
  it('renames only its recorded UUID without creating or deleting other resources', async () => {
    const test = setup();
    await provision(test);
    test.settings.cloudflareTunnelName = 'renamed';
    await provision(test);
    expect(test.created()).toBe(1);
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        url: `/accounts/${account}/cfd_tunnel/${firstId}`,
        data: { name: 'renamed' },
      })
    );
    expect(test.request.mock.calls.some(([options]) => options.method === 'DELETE')).toBe(false);
  });
  it('recreates a definitely deleted owned UUID and migrates only its owned aliases', async () => {
    const test = setup();
    await provision(test);
    test.deleted.add(firstId);
    await provision(test);
    expect(test.created()).toBe(2);
    expect(test.store.read().accounts[account]?.id).toBe(secondId);
    expect(test.records.get('node.example.com')?.content).toBe(`${secondId}.cfargotunnel.com`);
    expect(test.records.get('externalvideos.node.example.com')?.content).toBe(
      `${secondId}.cfargotunnel.com`
    );
  });
  it('does not recreate resources on authentication or network failures', async () => {
    const test = setup();
    await provision(test);
    test.request.mockRejectedValueOnce(
      Object.assign(new Error('forbidden'), { response: { status: 403 } })
    );
    await expect(provision(test)).rejects.toThrow('forbidden');
    expect(test.created()).toBe(1);
  });
  it('recovers DNS mutation intent if the final journal write fails after alias replacement', async () => {
    const test = setup();
    test.records.set('node.example.com', {
      id: 'old',
      name: 'node.example.com',
      type: 'A',
      content: '192.0.2.1',
      proxied: true,
    });
    await provision(test);
    test.deleted.add(firstId);
    const write = test.store.write.bind(test.store);
    let failed = false;
    vi.spyOn(test.store, 'write').mockImplementation((state) => {
      const route = state.routes[`${zone}:node.example.com`];
      if (!failed && route?.tunnelId === secondId && route.pendingTunnelId === undefined) {
        failed = true;
        throw new Error('disk full');
      }
      write(state);
    });
    await expect(provision(test)).rejects.toThrow('disk full');
    expect(test.store.read().routes[`${zone}:node.example.com`]?.pendingTunnelId).toBe(secondId);
    await restore(test);
    expect(test.records.get('node.example.com')?.content).toBe('192.0.2.1');
    await provision(test);
    expect(test.created()).toBe(2);
    expect(test.records.get('node.example.com')?.content).toBe(`${secondId}.cfargotunnel.com`);
  });
  it('can retry restoration after DNS was changed but journaling failed', async () => {
    const test = setup();
    test.records.set('node.example.com', {
      id: 'old',
      name: 'node.example.com',
      type: 'A',
      content: '192.0.2.1',
      proxied: true,
    });
    await provision(test);
    const write = test.store.write.bind(test.store);
    let failed = false;
    vi.spyOn(test.store, 'write').mockImplementation((state) => {
      if (!failed && state.routes[`${zone}:node.example.com`]?.active === false) {
        failed = true;
        throw new Error('disk full');
      }
      write(state);
    });
    await expect(restore(test)).rejects.toThrow('disk full');
    await restore(test);
    expect(test.records.get('node.example.com')?.content).toBe('192.0.2.1');
    expect(test.store.read().routes[`${zone}:node.example.com`]?.active).toBe(false);
  });
  it('restores aliases reintroduced by a failed provider rollback even after the journal marked them released', async () => {
    const test = setup();
    await provision(test);
    await restore(test);
    test.records.set('node.example.com', {
      id: 'rollback',
      name: 'node.example.com',
      type: 'CNAME',
      content: `${firstId}.cfargotunnel.com`,
      proxied: true,
    });
    await restore(test);
    expect(test.records.has('node.example.com')).toBe(false);
  });
  it('hands media DNS to the configured S3 target without restoring over it', async () => {
    const test = setup();
    await provision(test);
    const bucketName = 'externalvideos.node.example.com';
    const target = `${bucketName}.s3.us-east-1.amazonaws.com`;
    test.settings.storageConfig = {
      storageMode: 's3provider',
      s3Config: {
        bucketName,
        s3ProviderClientConfig: {
          forcePathStyle: false,
          region: 'us-east-1',
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
      },
    };
    test.records.set(bucketName, {
      id: 's3',
      name: bucketName,
      type: 'CNAME',
      content: target,
      proxied: true,
    });
    await provision(test);
    expect(test.records.get(bucketName)?.content).toBe(target);
    expect(test.store.read().routes[`${zone}:${bucketName}`]?.active).toBe(false);
    test.settings.storageConfig = { storageMode: 'filesystem' };
    await provision(test);
    await restore(test);
    expect(test.records.get(bucketName)?.content).toBe(target);
  });
});
