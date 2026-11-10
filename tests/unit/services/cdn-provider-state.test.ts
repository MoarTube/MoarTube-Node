import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import type { ProviderSnapshot } from '@/utils/cdn-journal.js';
vi.mock('axios');
vi.mock('@/config/index.js', async () => {
  const { buildNodeBaseUrl } = await import('@/config/urls.js');
  const nodeSettings = {
    isCloudflareCdnEnabled: false,
    publicNodeProtocol: 'https',
    publicNodeAddress: 'node.example',
    publicNodePort: '',
  };
  return {
    getConfig: () => ({
      nodeSettings,
      getNodeBaseUrl: () => buildNodeBaseUrl(nodeSettings as never),
    }),
  };
});
const credentials = { email: 'email', zone: 'zone', key: 'key' };
let service: CloudflareService;
let fields: Map<string, unknown>;
let rules: Array<Record<string, unknown>> | null;
let responseRules: Array<Record<string, unknown>> | null;
let rejectWrite: string | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  rejectWrite = undefined;
  responseRules = null;
  fields = new Map([
    ['settings/browser_cache_ttl', 3600],
    ['settings/cache_level', 'basic'],
    ['settings/always_use_https', 'off'],
    ['argo/tiered_caching', 'on'],
    ['cache/tiered_cache_smart_topology_enable', 'off'],
  ]);
  rules = [
    {
      id: 'original',
      version: '1',
      ref: 'ref',
      action: 'set_cache_settings',
      enabled: true,
      expression: 'true',
      description: 'Original rules',
      action_parameters: { cache: false },
    },
  ];
  vi.mocked(axios.get).mockImplementation(async (url) => {
    const relative = String(url).split('/zones/zone/')[1];
    if (relative === 'rulesets/phases/http_response_cache_settings/entrypoint') {
      if (responseRules === null) throw { response: { status: 404 } };
      return { data: { success: true, result: { id: 'response-managed', rules: responseRules } } };
    }
    if (relative === 'rulesets/phases/http_request_cache_settings/entrypoint') {
      if (rules === null) throw { response: { status: 404 } };
      return { data: { success: true, result: { id: 'managed', rules } } };
    }
    return { data: { success: true, result: { value: fields.get(relative) } } };
  });
  vi.mocked(axios.put).mockImplementation(async (url, body) => {
    if (rejectWrite === 'put') return { data: { success: false } };
    if (String(url).includes('/http_response_cache_settings/')) {
      responseRules = (body as { rules: Array<Record<string, unknown>> }).rules;
    } else rules = (body as { rules: Array<Record<string, unknown>> }).rules;
    return { data: { success: true } };
  });
  vi.mocked(axios.patch).mockImplementation(async (url, body) => {
    if (rejectWrite === 'patch') return { data: { success: false } };
    fields.set(String(url).split('/zones/zone/')[1], (body as { value: unknown }).value);
    return { data: { success: true } };
  });
  vi.mocked(axios.delete).mockImplementation(async (url) => {
    if (rejectWrite === 'delete') return { data: { success: false } };
    if (String(url).endsWith('/response-managed')) responseRules = null;
    else rules = null;
    return { data: { success: true } };
  });
  service = new CloudflareService(
    { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    {} as never
  );
});
const apply = () =>
  service.setCdnConfiguration(credentials.email, credentials.zone, credentials.key);

describe('CDN provider restoration', () => {
  it.each([false, true])(
    'restores original HTTPS, cache, tiered settings and rules (missing rules=%s), then safely repeats',
    async (missing) => {
      if (missing) rules = null;
      const before = await service.captureCdnSnapshot(credentials);
      const managed = service.managedCdnSnapshot();
      if (!missing) expect(before.rules?.[0]?.ref).toBe('ref');
      await service.verifyCdnChange(credentials, before, managed);
      await apply();
      await service.verifyCdnSnapshot(credentials, managed);
      await service.restoreCdnSnapshot(credentials, before, managed);
      expect(await service.captureCdnSnapshot(credentials)).toEqual(before);
      const writes = vi.mocked(axios.patch).mock.calls.length;
      await service.restoreCdnSnapshot(credentials, before, managed);
      expect(vi.mocked(axios.patch)).toHaveBeenCalledTimes(writes);
    }
  );
  it('allows interrupted partial restoration but rejects external edits before any write', async () => {
    const before = await service.captureCdnSnapshot(credentials),
      managed = service.managedCdnSnapshot();
    await apply();
    fields.set('settings/always_use_https', 'off');
    await service.restoreCdnSnapshot(credentials, before, managed);
    await apply();
    fields.set('settings/browser_cache_ttl', 120);
    vi.mocked(axios.patch).mockClear();
    await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow(
      'outside MoarTube'
    );
    expect(vi.mocked(axios.patch)).not.toHaveBeenCalled();
    await expect(service.verifyCdnChange(credentials, before, managed)).rejects.toThrow(
      'outside MoarTube'
    );
    await expect(service.verifyCdnSnapshot(credentials, managed)).rejects.toThrow(
      'outside MoarTube'
    );
  });
  it.each(['put', 'patch', 'delete'])(
    'retains a failed provider restoration for retry (%s)',
    async (kind) => {
      if (kind === 'delete') rules = null;
      const before = await service.captureCdnSnapshot(credentials),
        managed = service.managedCdnSnapshot();
      await apply();
      rejectWrite = kind;
      await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow(
        'restore'
      );
      rejectWrite = undefined;
      await service.restoreCdnSnapshot(credentials, before, managed);
    }
  );
  it('rejects false provider reads and unexpected HTTP errors', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { success: false } });
    await expect(service.captureCdnSnapshot(credentials)).rejects.toThrow('cache rules');
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network failure'));
    await expect(service.captureCdnSnapshot(credentials)).rejects.toThrow('network failure');
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, result: { rules: [] } } })
      .mockResolvedValueOnce({ data: { success: true, result: { rules: [] } } })
      .mockResolvedValueOnce({ data: { success: false } });
    await expect(service.captureCdnSnapshot(credentials)).rejects.toThrow('zone settings');
  });
});

it('does not restore blindly if the provider cannot locate the active ruleset', async () => {
  rules = null;
  const before = await service.captureCdnSnapshot(credentials),
    managed = service.managedCdnSnapshot();
  await apply();
  const implementation = vi.mocked(axios.get).getMockImplementation()!;
  let reads = 0;
  vi.mocked(axios.get).mockImplementation(async (...args) => {
    if (String(args[0]).includes('/http_request_cache_settings/') && ++reads === 2)
      return { data: { success: false } };
    return implementation(...args);
  });
  await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow('locate');
});

it('restores an existing response policy and refuses an external response-policy edit', async () => {
  responseRules = [
    {
      action: 'set_cache_control',
      expression: 'true',
      action_parameters: { 'no-store': { operation: 'set' } },
    },
  ];
  const before = await service.captureCdnSnapshot(credentials);
  const managed = service.managedCdnSnapshot();
  await apply();
  await service.restoreCdnSnapshot(credentials, before, managed);
  expect(responseRules).toEqual(before.responseRules);
  await apply();
  responseRules = [{ action: 'set_cache_control', expression: 'external-edit' }];
  const puts = vi.mocked(axios.put).mock.calls.length;
  await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow(
    'outside MoarTube'
  );
  expect(vi.mocked(axios.put)).toHaveBeenCalledTimes(puts);
});

it('captures the response baseline when upgrading a legacy journal before managing the new phase', async () => {
  const legacy = await service.captureCdnSnapshot(credentials);
  delete legacy.responseRules;
  const original = { before: structuredClone(legacy), applied: structuredClone(legacy) };
  await service.upgradeCdnSnapshot(credentials, original);
  expect(original.before.responseRules).toBeNull();
  expect(original.applied.responseRules).toBeNull();
  // A retry must not replace the original baseline with already-managed rules.
  await apply();
  await service.upgradeCdnSnapshot(credentials, original);
  expect(original.before.responseRules).toBeNull();
});

it('allows a partially applied policy upgrade to resume using the saved previous policy', async () => {
  const before = await service.captureCdnSnapshot(credentials);
  const previous = {
    ...before,
    rules: [{ action: 'set_cache_settings', expression: 'old-managed' }],
  };
  rules = previous.rules;
  const next = service.managedCdnSnapshot();
  await expect(
    service.verifyCdnChange(credentials, before, next, previous)
  ).resolves.toBeUndefined();
  await expect(service.verifyCdnChange(credentials, before, next)).rejects.toThrow(
    'outside MoarTube'
  );
  await apply();
  responseRules = previous.responseRules ?? null;
  await expect(
    service.verifyCdnChange(credentials, before, next, previous)
  ).resolves.toBeUndefined();
});

it('overrides missing, immutable and long-lived S3 metadata with separate image and video CDN policies', () => {
  const response = service.managedCdnSnapshot().responseRules!;
  expect(response).toHaveLength(4);
  const [fallback, publicMedia, videoMedia] = response as any[];
  expect(fallback.expression).toContain('externalvideos.');
  expect(fallback.action_parameters['no-store']).toEqual({ operation: 'set' });
  expect(publicMedia.expression).toContain('http.response.code in {200 206 304}');
  expect(publicMedia.expression).toContain('images');
  expect(videoMedia.expression).toContain('/static/manifests/');
  expect(videoMedia.action_parameters['max-age']).toEqual({ operation: 'set', value: 0 });
  expect(videoMedia.action_parameters['s-maxage']).toEqual({ operation: 'set', value: 31536000 });
  expect(videoMedia.expression).not.toContain('releases');
  expect(videoMedia.action_parameters.immutable).toEqual({ operation: 'remove' });
  expect(publicMedia.expression).not.toContain('/dynamic/manifests/');
  expect(publicMedia.expression).toContain('set-cookie');
  expect(publicMedia.expression).toContain('authorization');
  expect(publicMedia.expression).toContain('x-http-method-override');
  for (const origin of [
    {},
    { 'max-age': 31536000, immutable: true },
    { 'no-store': true },
    { private: true, 'no-cache': true, 'stale-if-error': 86400, 'stale-while-revalidate': 86400 },
  ]) {
    for (const [rule, ttl] of [
      [publicMedia, 30],
      [videoMedia, 31536000],
    ] as const) {
      const result: any = { ...origin };
      for (const [key, directive] of Object.entries(rule.action_parameters) as any) {
        if (directive.operation === 'remove') delete result[key];
        else result[key] = directive.value ?? true;
      }
      expect(result).toEqual({
        'max-age': 0,
        's-maxage': ttl,
        public: true,
        'must-revalidate': true,
      });
    }
  }
});

it('microcaches only explicitly marked successful S3 live playlists, with browser revalidation', () => {
  const rules = service.managedCdnSnapshot().responseRules! as any[];
  const live = rules.find((rule) => rule.ref === 'moartube_s3_live_playlist');
  expect(live.expression).toContain('/adaptive/m3u8/dynamic/manifests/');
  expect(live.expression).toContain('ends_with(http.request.uri.path, ".m3u8")');
  expect(live.expression).toContain('http.response.code eq 200');
  expect(live.expression).toContain(
    'http.response.headers["x-amz-meta-moartube-live-playlist"][0] eq "active"'
  );
  expect(live.expression).toContain(
    'len(http.response.headers["x-amz-meta-moartube-live-playlist"]) eq 1'
  );
  expect(live.expression).toContain('application/vnd.apple.mpegurl');
  expect(live.expression).toContain('"GET" "HEAD"');
  for (const guard of ['authorization', 'set-cookie', 'x-http-method-override', 'origin']) {
    expect(live.expression).toContain(guard);
  }
  expect(live.expression).not.toContain('/static/manifests/');
  expect(live.action_parameters).toMatchObject({
    'max-age': { operation: 'set', value: 0 },
    's-maxage': { operation: 'set', value: 1 },
    'must-revalidate': { operation: 'set' },
    'no-store': { operation: 'remove' },
    immutable: { operation: 'remove' },
    'stale-while-revalidate': { operation: 'remove' },
    'stale-if-error': { operation: 'remove' },
  });
  expect(rules[0].action_parameters['no-store']).toEqual({ operation: 'set' });
});

it('builds both rule phases for the target public origin before settings commit', async () => {
  vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } });
  await service.setCdnConfiguration('email', 'zone', 'key', 'https://new.example');
  const managed = service.managedCdnSnapshot('https://new.example');
  const variant = managed.rules!.find((rule) => String(rule.description).includes('Noncanonical'))!;
  expect(variant.expression).toContain('https://new.example');
  expect(variant.expression).not.toContain('node.example');
  expect(managed.responseRules![1].expression).toContain('https://new.example');
  const posted = vi.mocked(axios.put).mock.calls.map(([, body]) => body);
  expect(posted).toEqual([{ rules: managed.rules }, { rules: managed.responseRules }]);
});

it('preserves false and failed response-policy reads', async () => {
  vi.mocked(axios.get).mockResolvedValueOnce({ data: { success: false } });
  await expect((service as any).readResponseRules('https://provider', {})).rejects.toThrow('response cache rules');
  vi.mocked(axios.get).mockRejectedValueOnce(new Error('read failed'));
  await expect((service as any).readResponseRules('https://provider', {})).rejects.toThrow('read failed');
});
it.each(['get', 'delete', 'put'])('retains failed response-policy restoration for retry (%s)', async mode => {
  if (mode === 'put') responseRules = [{ action: 'set_cache_control', expression: 'old' }];
  const before = await service.captureCdnSnapshot(credentials), managed = service.managedCdnSnapshot();
  await apply();
  if (mode === 'get') {
    const original = vi.mocked(axios.get).getMockImplementation()!; let count = 0;
    vi.mocked(axios.get).mockImplementation(async (...args) => String(args[0]).includes('/http_response_cache_settings/') && ++count === 2 ? { data: { success: false } } : original(...args));
  } else if (mode === 'delete') vi.mocked(axios.delete).mockResolvedValue({ data: { success: false } });
  else {
    const original = vi.mocked(axios.put).getMockImplementation()!;
    vi.mocked(axios.put).mockImplementation(async (...args) => String(args[0]).includes('/http_response_cache_settings/') ? { data: { success: false } } : original(...args));
  }
  await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow(/locate|restore/);
});
it.each(['existing', 'locate', 'delete', 'network', 'success'])('accounts for response-policy rollback failures (%s)', async mode => {
  if (mode === 'existing') responseRules = [];
  vi.spyOn(service as any, 'listDnsRecords').mockResolvedValue([]);
  const get = vi.mocked(axios.get).getMockImplementation()!;
  const put = vi.mocked(axios.put).getMockImplementation()!;
  let restoring = false;
  vi.mocked(axios.get).mockImplementation(async (...args) => {
    if (restoring && String(args[0]).includes('/http_response_cache_settings/')) {
      if (mode === 'locate') return { data: { success: false } };
      if (mode === 'network') throw new Error('provider unavailable');
    }
    return get(...args);
  });
  vi.mocked(axios.put).mockImplementation(async (...args) => restoring && mode === 'existing' && String(args[0]).includes('/http_response_cache_settings/') ? { data: { success: false } } : put(...args));
  if (mode === 'delete') vi.mocked(axios.delete).mockResolvedValue({ data: { success: false } });
  await expect(service.withConfigurationRollback('email', 'zone', 'key', async () => {
    restoring = true; responseRules = []; throw new Error('change failed');
  })).rejects.toThrow();
  expect(restoring).toBe(true);
});
it('rejects a provider refusal to install response-cache rules', async () => {
  const put = vi.mocked(axios.put).getMockImplementation()!;
  vi.mocked(axios.put).mockImplementation(async (...args) => String(args[0]).includes('/http_response_cache_settings/') ? { data: { success: false } } : put(...args));
  await expect(apply()).rejects.toThrow('Could not set CDN response cache rules');
});

it('refuses final verification of legacy snapshots without overwriting an uncaptured response phase', async () => {
  const before = await service.captureCdnSnapshot(credentials);
  delete before.responseRules;
  const managed = service.managedCdnSnapshot();
  await apply();
  const response = structuredClone(responseRules);
  await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow('outside MoarTube');
  expect(responseRules).toEqual(response);
});
