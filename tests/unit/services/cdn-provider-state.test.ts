import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import type { ProviderSnapshot } from '@/utils/cdn-journal.js';
vi.mock('axios');
vi.mock('@/config/index.js', () => ({
  getConfig: () => ({ nodeSettings: { isCloudflareCdnEnabled: false } }),
}));
const credentials = { email: 'email', zone: 'zone', key: 'key' };
let service: CloudflareService;
let fields: Map<string, unknown>;
let rules: Array<Record<string, unknown>> | null;
let rejectWrite: string | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  rejectWrite = undefined;
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
    if (relative === 'rulesets/phases/http_request_cache_settings/entrypoint') {
      if (rules === null) throw { response: { status: 404 } };
      return { data: { success: true, result: { id: 'managed', rules } } };
    }
    return { data: { success: true, result: { value: fields.get(relative) } } };
  });
  vi.mocked(axios.put).mockImplementation(async (url, body) => {
    if (rejectWrite === 'put') return { data: { success: false } };
    rules = (body as { rules: Array<Record<string, unknown>> }).rules;
    return { data: { success: true } };
  });
  vi.mocked(axios.patch).mockImplementation(async (url, body) => {
    if (rejectWrite === 'patch') return { data: { success: false } };
    fields.set(String(url).split('/zones/zone/')[1], (body as { value: unknown }).value);
    return { data: { success: true } };
  });
  vi.mocked(axios.delete).mockImplementation(async () => {
    if (rejectWrite === 'delete') return { data: { success: false } };
    rules = null;
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
    if (String(args[0]).endsWith('/entrypoint') && ++reads === 2)
      return { data: { success: false } };
    return implementation(...args);
  });
  await expect(service.restoreCdnSnapshot(credentials, before, managed)).rejects.toThrow('locate');
});
