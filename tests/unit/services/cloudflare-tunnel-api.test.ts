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

const account = 'a'.repeat(32);
const zone = 'b'.repeat(32);
const id = '11111111-1111-4111-8111-111111111111';
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-tunnel-api-test-'));
  directories.push(directory);
  const store = new TunnelOwnershipStore(path.join(directory, 'private.json'));
  let records: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
    proxied: boolean;
  }> = [];
  const settings: TunnelSettings = {
    isCloudflareCdnEnabled: true,
    cloudflareTunnelName: 'named',
    cloudflareEmailAddress: 'email',
    cloudflareZoneId: zone,
    cloudflareGlobalApiKey: 'secret-key',
    publicNodeAddress: 'node.example.com',
    nodeListeningPort: 9090,
    storageConfig: { storageMode: 's3provider' },
  };
  const request = vi.fn<TunnelHttp['request']>(async (options) => {
    let result: unknown = {};
    if (options.url === `/zones/${zone}`)
      result = { name: 'example.com', account: { id: account } };
    else if (options.url.endsWith('/token')) result = 'secret-token';
    else if (options.url.includes('dns_records?')) result = records;
    else if (options.url.includes('dns_records') && options.method !== 'GET') {
      const record = { id: 'dns-id', ...(options.data as (typeof records)[number]) };
      records = [record];
      result = record;
    } else if (options.url.endsWith('/cfd_tunnel') && options.method === 'POST') result = { id };
    else if (options.url.endsWith(`/cfd_tunnel/${id}`)) result = { id, deleted_at: null };
    return { data: { success: true, result } };
  });
  return {
    api: new CloudflareTunnelApi(store, { request }),
    request,
    store,
    settings,
    directory,
    setRecords: (value: typeof records) => {
      records = value;
    },
  };
}
const provision = (test: ReturnType<typeof setup>) =>
  test.api.provision(test.settings, 'http://127.0.0.1:9090', new AbortController().signal);

describe('named Cloudflare Tunnel provisioning', () => {
  it('uses the validated name snapshot if a caller mutates settings during REST lookup',async()=>{
    const test=setup();const original=test.request.getMockImplementation()!;
    test.request.mockImplementation(async options=>{const response=await original(options);if(options.url===`/zones/${zone}`)test.settings.cloudflareTunnelName=undefined;return response;});
    await provision(test);expect(test.request).toHaveBeenCalledWith(expect.objectContaining({method:'POST',data:{name:'named',config_src:'cloudflare'}}));
  });
  it.each(['cloudflareEmailAddress','cloudflareGlobalApiKey','cloudflareZoneId','cloudflareTunnelName'])('requires %s before making any provider request',async field=>{
    const test=setup();(test.settings as any)[field]=undefined;
    await expect(provision(test)).rejects.toThrow('Missing');expect(test.request).not.toHaveBeenCalled();
  });
  it('rejects provider-declared DNS errors and requires restoration credentials',async()=>{
    const test=setup();await provision(test);
    await expect(test.api.restoreRoutes({...test.settings,cloudflareEmailAddress:''},new AbortController().signal)).rejects.toThrow('credentials');
    await expect(test.api.restoreRoutes({...test.settings,cloudflareGlobalApiKey:''},new AbortController().signal)).rejects.toThrow('credentials');
    test.request.mockResolvedValueOnce({data:{success:false,result:[]}});
    await expect(test.api.restoreRoutes(test.settings,new AbortController().signal)).rejects.toThrow('DNS restoration failed');
  });
  it('marks missing owned aliases released and detects a missing replaced predecessor',async()=>{
    const test=setup();await provision(test);test.setRecords([]);
    await test.api.restoreRoutes(test.settings,new AbortController().signal);
    expect(Object.values(test.store.read().routes).every(r=>!r.active)).toBe(true);
    const state=test.store.read();const route=Object.values(state.routes)[0]!;route.active=true;route.previous={id:'before',name:route.hostname,type:'A',content:'192.0.2.1'};test.store.write(state);
    await expect(test.api.restoreRoutes(test.settings,new AbortController().signal)).rejects.toThrow('Conflicting DNS');
  });
  it.each([undefined,'','2026-01-01'])('handles recorded remote deleted_at=%s without adopting by name',async deleted_at=>{
    const test=setup();await provision(test);test.request.mockResolvedValueOnce({data:{success:true,result:{name:'example.com',account:{id:account}}}}).mockResolvedValueOnce({data:{success:true,result:{id,deleted_at}}});
    await provision(test);
    const creates=test.request.mock.calls.filter(([o])=>o.method==='POST'&&o.url.endsWith('/cfd_tunnel'));
    expect(creates).toHaveLength(deleted_at?2:1);
  });
  it('does not recreate on a plain network Error without an HTTP response',async()=>{
    const test=setup();await provision(test);test.request.mockResolvedValueOnce({data:{success:true,result:{name:'example.com',account:{id:account}}}}).mockRejectedValueOnce(new Error('offline'));
    await expect(provision(test)).rejects.toThrow('offline');
    expect(test.request.mock.calls.filter(([o])=>o.method==='POST'&&o.url.endsWith('/cfd_tunnel'))).toHaveLength(1);
  });
  it('reuses restored direct DNS even when Cloudflare assigned it a new record ID', async () => {
    const test = setup();
    test.setRecords([
      {
        id: 'original-id',
        name: 'node.example.com',
        type: 'A',
        content: '192.0.2.1',
        proxied: true,
      },
    ]);
    await provision(test);
    await test.api.restoreRoutes(test.settings, new AbortController().signal);
    await expect(provision(test)).resolves.toMatchObject({ publicUrl: 'https://node.example.com' });
  });
  it('resolves the account, creates over REST, configures ingress/DNS, and keeps secrets off disk', async () => {
    const test = setup();
    expect(await provision(test)).toEqual({
      token: 'secret-token',
      publicUrl: 'https://node.example.com',
    });
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: `/accounts/${account}/cfd_tunnel`,
        data: { name: 'named', config_src: 'cloudflare' },
        headers: { 'X-Auth-Email': 'email', 'X-Auth-Key': 'secret-key' },
      })
    );
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: `/accounts/${account}/cfd_tunnel/${id}/configurations`,
        data: {
          config: {
            ingress: [
              { hostname: 'node.example.com', service: 'http://127.0.0.1:9090' },
              { service: 'http_status:404' },
            ],
          },
        },
      })
    );
    const journal = fs.readFileSync(path.join(test.directory, 'private.json'), 'utf8');
    expect(journal).toContain(id);
    expect(journal).not.toContain('secret-key');
    expect(journal).not.toContain('secret-token');
  });

  it('reuses only its recorded UUID across restarts; never lists/adopts by name', async () => {
    const test = setup();
    await provision(test);
    await provision(test);
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        url: `/accounts/${account}/cfd_tunnel/${id}`,
        data: { name: 'named' },
      })
    );
    expect(
      test.request.mock.calls.filter(
        ([options]) => options.method === 'POST' && options.url.endsWith('/cfd_tunnel')
      )
    ).toHaveLength(1);
    expect(
      test.request.mock.calls.some(
        ([options]) => options.method === 'GET' && options.url.endsWith('/cfd_tunnel')
      )
    ).toBe(false);
  });

  it('journals the original direct DNS record before replacing it', async () => {
    const test = setup();
    const previous = {
      id: 'direct-id',
      name: 'node.example.com',
      type: 'A',
      content: '192.0.2.1',
      proxied: true,
    };
    test.setRecords([previous]);
    await provision(test);
    expect(test.store.read().routes[`${zone}:node.example.com`]!.previous).toEqual(previous);
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: `/zones/${zone}/dns_records/direct-id`,
        data: expect.objectContaining({ type: 'CNAME', content: `${id}.cfargotunnel.com` }),
      })
    );
  });

  it('rejects multiple conflicting DNS records instead of deleting them', async () => {
    const test = setup();
    test.setRecords([
      { id: 'a', name: 'node.example.com', type: 'A', content: '192.0.2.1', proxied: true },
      { id: 'b', name: 'node.example.com', type: 'AAAA', content: '::1', proxied: true },
    ]);
    await expect(provision(test)).rejects.toThrow('Conflicting DNS');
    expect(test.request.mock.calls.some(([options]) => options.method === 'DELETE')).toBe(false);
  });

  it('refuses to overwrite a managed DNS record changed by someone else', async () => {
    const test = setup();
    await provision(test);
    test.setRecords([
      { id: 'dns-id', name: 'node.example.com', type: 'A', content: '192.0.2.99', proxied: false },
    ]);
    await expect(provision(test)).rejects.toThrow('changed externally');
  });

  it('rejects hostname/zone mismatch before creating any tunnel', async () => {
    const test = setup();
    test.settings.publicNodeAddress = 'node.other.com';
    await expect(provision(test)).rejects.toThrow('outside Cloudflare zone');
    expect(test.request.mock.calls.some(([options]) => options.method === 'POST')).toBe(false);
  });

  it('compensates for a newly created resource if the ownership write fails', async () => {
    const test = setup();
    vi.spyOn(test.store, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(provision(test)).rejects.toThrow('Could not save');
    expect(test.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: `/accounts/${account}/cfd_tunnel/${id}` })
    );
  });

  it('propagates provider rejection and rejects missing credentials before requesting', async () => {
    const test = setup();
    test.request.mockResolvedValueOnce({ data: { success: false, result: {} } });
    await expect(provision(test)).rejects.toThrow('REST request failed');
    test.request.mockClear();
    test.settings.cloudflareGlobalApiKey = '';
    await expect(provision(test)).rejects.toThrow('Missing');
    expect(test.request).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed ownership journal', async () => {
    const test = setup();
    fs.writeFileSync(path.join(test.directory, 'private.json'), '{bad');
    await expect(provision(test)).rejects.toThrow();
    expect(test.request.mock.calls.some(([options]) => options.method === 'POST')).toBe(false);
  });
});
