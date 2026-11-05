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

const id = '11111111-1111-4111-8111-111111111111';
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function setup(previous = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-dns-restore-'));
  directories.push(directory);
  const store = new TunnelOwnershipStore(path.join(directory, 'private.json'));
  store.write({
    accounts: {},
    routes: {
      route: {
        zone: 'zone',
        hostname: 'node.example.com',
        tunnelId: id,
        ...(previous
          ? {
              previous: {
                id: 'original',
                name: 'node.example.com',
                type: 'A',
                content: '192.0.2.1',
                proxied: true,
              },
            }
          : {}),
      },
    },
  });
  let current: object[] = [
    {
      id: 'managed',
      name: 'node.example.com',
      type: 'CNAME',
      content: `${id}.cfargotunnel.com`,
      proxied: true,
    },
  ];
  const request = vi.fn<TunnelHttp['request']>(async (options) => {
    if (options.method === 'GET') return { data: { success: true, result: current } };
    current = options.method === 'DELETE' ? [] : [{ ...(options.data as object), id: 'managed' }];
    return { data: { success: true, result: {} } };
  });
  const settings: TunnelSettings = {
    isCloudflareCdnEnabled: true,
    cloudflareEmailAddress: 'email',
    cloudflareZoneId: 'zone',
    cloudflareGlobalApiKey: 'key',
    publicNodeAddress: 'node.example.com',
    nodeListeningPort: 9090,
  };
  return {
    api: new CloudflareTunnelApi(store, { request }),
    request,
    store,
    settings,
    setCurrent: (records: object[]) => {
      current = records;
    },
  };
}
describe('owned tunnel DNS restoration', () => {
  it('does not mutate or reject externally added records after ownership was released', async () => {
    const test = setup();
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    test.setCurrent([
      {
        id: 'external-one',
        name: 'node.example.com',
        type: 'A',
        content: '192.0.2.10',
        proxied: true,
      },
      {
        id: 'external-two',
        name: 'node.example.com',
        type: 'A',
        content: '192.0.2.11',
        proxied: true,
      },
    ]);
    test.request.mockClear();
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    expect(test.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true);
  });
  it('restores a journaled record, retains ownership for rollback/reuse, and is idempotent', async () => {
    const test = setup();
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    expect(test.request.mock.calls.filter(([options]) => options.method === 'PUT')).toHaveLength(1);
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/zones/zone/dns_records/managed',
        data: { name: 'node.example.com', type: 'A', content: '192.0.2.1', proxied: true },
      })
    );
    expect(test.store.read().routes.route).toBeDefined();
  });
  it('deletes only an owned route which had no predecessor', async () => {
    const test = setup(false);
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    expect(test.request.mock.calls.filter(([options]) => options.method === 'DELETE')).toHaveLength(
      1
    );
  });
  it('refuses to replace externally changed records', async () => {
    const test = setup();
    test.setCurrent([
      { id: 'managed', name: 'node.example.com', type: 'A', content: '192.0.2.99', proxied: true },
    ]);
    await expect(
      test.api.restoreRoutes(test.settings, new AbortController().signal)
    ).rejects.toThrow('externally');
    expect(test.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true);
  });
  it('does nothing in a zone with no owned routes', async () => {
    const test = setup();
    test.settings.cloudflareZoneId = 'another-zone';
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    expect(test.request).not.toHaveBeenCalled();
  });
});
