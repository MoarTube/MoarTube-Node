import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import type { Logger } from '@/utils/logger.js';

vi.mock('axios');
const config = vi.hoisted(() => ({
  nodeSettings: {
    isCloudflareCdnEnabled: true,
    cloudflareEmailAddress: 'test@example.com',
    cloudflareZoneId: 'zone',
    cloudflareGlobalApiKey: 'test',
    publicNodeAddress: 'example.com',
    storageConfig: { storageMode: 'filesystem' },
  },
  getExternalVideosBaseUrl: () => 'https://example.com',
}));
vi.mock('@config/index.js', () => ({ getConfig: () => config }));

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
} as unknown as Logger;
let service: CloudflareService;
const post = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  service = new CloudflareService(logger, {} as never);
});

describe('CDN failure recovery', () => {
  it.each(['120', new Date(220_000).toUTCString()])(
    'honors Retry-After %s without blocking or dropping remaining work',
    async (retryAfter) => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);
      try {
        post.mockRejectedValueOnce({
          response: { status: 429, headers: { 'retry-after': retryAfter } },
        });
        post.mockResolvedValue({ data: { success: true } });
        const internal = service as unknown as {
          purgeCache(files: string[], operation: string): Promise<void>;
        };
        const files = Array.from({ length: 101 }, (_, index) => `https://example.com/${index}`);
        await expect(internal.purgeCache(files, 'test')).rejects.toThrow('incomplete');
        expect(post).toHaveBeenCalledOnce();
        await expect(internal.purgeCache(['https://example.com/new'], 'test')).rejects.toThrow(
          'incomplete'
        );
        expect(post).toHaveBeenCalledOnce();
        vi.setSystemTime(220_000);
        await internal.purgeCache(['https://example.com/new'], 'test');
        expect(post).toHaveBeenCalledTimes(3);
        expect(post.mock.calls[2][1].files).toEqual(['https://example.com/100', 'https://example.com/new']);
        expect(post.mock.calls.slice(1).flatMap(([, body]) => body.files)).toEqual([...files, 'https://example.com/new']);
      } finally {
        vi.useRealTimers();
      }
    }
  );
  it('retries a transient rejected-body purge response', async () => {
    vi.useFakeTimers();
    try {
      post.mockResolvedValueOnce({ data: { success: false } });
      post.mockResolvedValue({ data: { success: true } });
      const internal = service as unknown as {
        purgeCache(files: string[], operation: string): Promise<void>;
      };
      const pending = internal.purgeCache(['https://example.com/changed'], 'test');
      await vi.runAllTimersAsync();
      await pending;
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([
    ['https://example.com/changed', 1000],
    ['prefix:example.com/changed', 12000],
  ])('defers Retry-After zero for the minimum lane cooldown (%s)', async (target, cooldown) => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    try {
      post.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } });
      post.mockResolvedValue({ data: { success: true } });
      const internal = service as unknown as { purgeCache(files: string[], operation: string): Promise<void> };
      await expect(internal.purgeCache([target as string], 'test')).rejects.toThrow('incomplete');
      expect(post).toHaveBeenCalledOnce();
      vi.setSystemTime(100_000 + Number(cooldown) - 1);
      await expect(internal.purgeCache([], 'test')).rejects.toThrow('incomplete');
      expect(post).toHaveBeenCalledOnce();
      vi.setSystemTime(100_000 + Number(cooldown));
      await internal.purgeCache([], 'test');
      expect(post).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('coalesces non-strict notifications while one broad request is in flight', async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    post.mockResolvedValue({ data: { success: true } });
    const first = service.purgeHomePage(['one']);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await service.purgeHomePage(['two']);
    expect(post).toHaveBeenCalledOnce();
    finish({ data: { success: true } });
    await first;
    await service.retryPendingPurges();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ tags: ['moartube-home', 'moartube-video-two'] });
  });
  it.each([false, true])('rejects an unusable zone response (success=%s)', async (success) => {
    vi.mocked(axios.get).mockResolvedValue({ data: { success, result: { name: '' } } });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', config.nodeSettings as never)
    ).rejects.toThrow('Could not validate');
  });

  it.each([new Error('offline'), { response: { status: 403 } }])(
    'does not mutate when snapshot acquisition fails: %j',
    async (failure) => {
      vi.mocked(axios.get).mockRejectedValue(failure);
      const operation = vi.fn();
      await expect(
        service.withConfigurationRollback('email', 'zone', 'key', operation)
      ).rejects.toEqual(failure);
      expect(operation).not.toHaveBeenCalled();
    }
  );

  it.each(['created', 'absent', 'failed', 'offline'])(
    'recovers a failed first-time setup when rules are %s',
    async (mode) => {
      let entrypointReads = 0;
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (url.includes('/http_response_cache_settings/')) throw { response: { status: 404 } };
        if (url.includes('/entrypoint')) {
          entrypointReads++;
          if (entrypointReads === 1 || mode === 'absent') throw { response: { status: 404 } };
          if (mode === 'failed') throw { response: { status: 500 } };
          if (mode === 'offline') throw new Error('offline');
          return { data: { result: { id: 'created' } } };
        }
        if (url.includes('/dns_records')) return { data: { success: true, result: [] } };
        return { data: { result: { value: 'off' } } };
      });
      vi.mocked(axios.delete).mockResolvedValue({});
      vi.mocked(axios.patch).mockResolvedValue({});
      const action = () =>
        service.withConfigurationRollback('email', 'zone', 'key', async () => {
          throw new Error('apply failed');
        });
      await expect(action()).rejects.toThrow(
        ['failed', 'offline'].includes(mode)
          ? 'recovery is incomplete'
          : 'previous zone configuration was restored'
      );
      if (mode === 'created')
        expect(axios.delete).toHaveBeenCalledWith(
          expect.stringContaining('/rulesets/created'),
          expect.anything()
        );
    }
  );

  it('recreates a removed DNS record during recovery and reports restoration failures', async () => {
    let dnsReads = 0;
    vi.mocked(axios.get).mockImplementation(async (url) => {
      if (url.includes('/http_response_cache_settings/')) throw { response: { status: 404 } };
      if (url.includes('/entrypoint')) return { data: { result: { id: 'rules', rules: [] } } };
      if (url.includes('/dns_records'))
        return {
          data: {
            success: true,
            result:
              ++dnsReads === 1
                ? [{ id: 'old', name: 'old.example.com', type: 'CNAME', content: 'old' }]
                : [],
          },
        };
      return { data: { result: { value: 'off' } } };
    });
    vi.mocked(axios.put).mockResolvedValue({});
    vi.mocked(axios.patch).mockResolvedValue({});
    vi.mocked(axios.post).mockRejectedValue(new Error('DNS restore denied'));
    await expect(
      service.withConfigurationRollback('email', 'zone', 'key', async () => {
        throw new Error('apply failed');
      })
    ).rejects.toThrow('recovery is incomplete');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/dns_records'),
      { name: 'old.example.com', type: 'CNAME', content: 'old' },
      expect.anything()
    );
  });

  it('stops before mutation if paginated DNS lookup is rejected', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { success: false, result: [] } });
    await expect(
      service.addCdnDnsRecord('email', 'zone', 'key', {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'externalvideos.example.com',
          s3ProviderClientConfig: { region: 'test' },
        },
      })
    ).rejects.toThrow('DNS lookup failed');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('restores rules, settings and DNS when a later required configuration step fails', async () => {
    let rules = [{ description: 'previous' }];
    const values = new Map<string, unknown>();
    const records = [
      { id: 'old', name: 'externalvideos.example.com', type: 'CNAME', content: 'old.example' },
    ];
    Object.assign(records[0], { created_on: 'read-only', ttl: 300 });
    vi.mocked(axios.get).mockImplementation(async (url) => {
      if (url.includes('/http_response_cache_settings/')) throw { response: { status: 404 } };
      if (url.includes('/entrypoint'))
        return { data: { result: { id: 'rules', rules: structuredClone(rules) } } };
      if (url.includes('/dns_records'))
        return { data: { success: true, result: structuredClone(records) } };
      return { data: { result: { value: values.get(url) ?? 'off' } } };
    });
    vi.mocked(axios.put).mockImplementation(async (url, body) => {
      if (url.includes('/entrypoint')) rules = body.rules;
      else Object.assign(records.find((record) => url.endsWith(record.id))!, body);
      return { data: { success: true } };
    });
    vi.mocked(axios.patch).mockImplementation(async (url, body) => {
      values.set(url, body.value);
      return {};
    });
    vi.mocked(axios.delete).mockImplementation(async (url) => {
      records.splice(
        records.findIndex((record) => url.endsWith(record.id)),
        1
      );
      return {};
    });
    await expect(
      service.withConfigurationRollback('email', 'zone', 'key', async () => {
        rules = [{ description: 'new' }];
        records[0]!.content = 'new.example';
        records.push({
          id: 'new',
          name: 'new.example.com',
          type: 'CNAME',
          content: 'provider.example',
        });
        throw new Error('DNS write failed');
      })
    ).rejects.toThrow('previous zone configuration was restored');
    expect(rules).toEqual([{ description: 'previous' }]);
    expect(records).toEqual([
      {
        id: 'old',
        name: 'externalvideos.example.com',
        type: 'CNAME',
        content: 'old.example',
        created_on: 'read-only',
        ttl: 300,
      },
    ]);
    expect([...values.values()]).toEqual(Array(5).fill('off'));
    const restoredDns = vi
      .mocked(axios.put)
      .mock.calls.find(([url]) => url.endsWith('/dns_records/old'));
    expect(restoredDns?.[1]).toEqual({
      name: 'externalvideos.example.com',
      type: 'CNAME',
      content: 'old.example',
      ttl: 300,
    });
  });

  it('updates a DNS record found on a later page without deleting it first', async () => {
    vi.mocked(axios.get).mockImplementation(async (_url, options) => ({
      data: {
        success: true,
        result:
          options?.params.page === 1
            ? [{ id: 'other', name: 'other.example.com' }]
            : [{ id: 'media', name: 'externalvideos.example.com' }],
        result_info: { total_pages: 2 },
      },
    }));
    vi.mocked(axios.put).mockResolvedValue({ data: { success: true } });
    await service.addCdnDnsRecord('email', 'zone', 'key', {
      storageMode: 's3provider',
      s3Config: {
        bucketName: 'externalvideos.example.com',
        s3ProviderClientConfig: { region: 'us-east-1' },
      },
    });
    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('/dns_records/media'),
      expect.objectContaining({ name: 'externalvideos.example.com', type: 'CNAME' }),
      expect.anything()
    );
    expect(axios.delete).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('continues after a failed middle purge batch and retains its URLs for the next request', async () => {
    const failed = Array.from({ length: 100 }, (_, index) => `https://example.com/failed-${index}`);
    post.mockImplementation(async (_url, body) => {
      if (body.files.includes(failed[0])) throw { response: { status: 403 } };
      return { data: { success: true } };
    });
    const internal = service as unknown as {
      purgeCache(files: string[], operation: string): Promise<void>;
    };
    await expect(
      internal.purgeCache(
        [
          ...Array.from({ length: 100 }, (_, index) => `https://example.com/first-${index}`),
          ...failed,
          'https://example.com/last',
        ],
        'test'
      )
    ).rejects.toThrow('incomplete');
    expect(post.mock.calls[2]![1].files).toEqual(['https://example.com/last']);
    post.mockResolvedValue({ data: { success: true } });
    await internal.purgeCache(['https://example.com/new'], 'test');
    expect(post.mock.calls[3]![1].files).toEqual(failed);
    expect(post.mock.calls[4]![1].files).toEqual(['https://example.com/new']);
    expect(logger.error).toHaveBeenCalled();
  });

  it('validates zone membership before DNS changes', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { success: true, result: { name: 'other.example' } },
    });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', config.nodeSettings as never)
    ).rejects.toThrow('selected Cloudflare zone');
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
