import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import {
  withCloudflareDeadline,
  withCloudflareRecovery,
  cloudflareOptions,
} from '@/utils/cloudflare-http.js';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsController } from '@/controllers/settings.js';
import { VideosController } from '@/controllers/videos.js';
import Fastify from 'fastify';
import { withSettingsChange } from '@/utils/settings-change.js';

vi.mock('axios');
const state = vi.hoisted(() => ({ config: {} as any }));
vi.mock('@config/index.js', () => ({ getConfig: () => state.config }));
let service: CloudflareService;
let post: ReturnType<typeof vi.fn>;
const success = { data: { success: true } };
beforeEach(() => {
  vi.resetAllMocks();
  state.config = {
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareGlobalApiKey: 'key',
      cloudflareEmailAddress: 'email',
      cloudflareZoneId: 'zone',
      publicNodeAddress: 'node.example.com',
      storageConfig: { storageMode: 'filesystem' },
    },
    getNodeBaseUrl: () => 'https://node.example.com',
    getExternalVideosBaseUrl: () => 'https://externalvideos.node.example.com',
  };
  post = vi.fn().mockResolvedValue(success);
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  service = new CloudflareService(
    { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
    {} as never
  );
});
describe('follow-up Cloudflare correctness', () => {
  it('shares the transition deadline with creation of a missing media DNS record', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { success: true, result: [] } });
    vi.mocked(axios.post).mockResolvedValue(success);
    await withCloudflareDeadline(async () => {
      const signal = cloudflareOptions({}).signal;
      await service.addCdnDnsRecord('email', 'zone', 'key', {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'externalvideos.node.example.com',
          s3ProviderClientConfig: { region: 'us-east-1' },
        },
      });
      expect(vi.mocked(axios.post).mock.calls[0]![2]).toEqual(
        expect.objectContaining({ timeout: 10_000, signal })
      );
    });
  });
  it('invalidates a video without depending on successful storage inventory', async () => {
    const inventory = vi
      .spyOn(service, 'getAdaptiveVideoUrls')
      .mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EACCES' }))
      .mockResolvedValue([]);
    const app = Fastify();
    const controller = new VideosController(
      {} as never,
      {} as never,
      {} as never,
      service,
      {} as never
    );
    app.post('/videos/:videoId/cache/invalidate', controller.invalidateCache);
    try {
      expect(
        (await app.inject({ method: 'POST', url: '/videos/video/cache/invalidate' })).statusCode
      ).toBe(200);
      expect(post.mock.calls.flatMap((call) => call[1].prefixes ?? [])).toContain(
        'externalvideos.node.example.com/external/videos/video/'
      );
      expect(inventory).not.toHaveBeenCalled();
      expect(
        (await app.inject({ method: 'POST', url: '/videos/video/cache/invalidate' })).statusCode
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
  it('bounds a stalled configuration mutation, performs recovery and releases the controller lock', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'moartube-cdn-deadline-'));
    state.config.paths = { nodeSettingsPath: path.join(root, 'settings.json') };
    state.config.reloadNodeSettings = vi.fn();
    state.config.nodeSettings.publicNodeAddress = 'example.com';
    vi.mocked(axios.get).mockImplementation(async (url) => {
      if (url.endsWith('/zones/zone'))
        return { data: { success: true, result: { name: 'example.com' } } };
      if (url.includes('entrypoint'))
        return { data: { success: true, result: { id: 'previous', rules: [] } } };
      if (url.includes('/dns_records')) return { data: { success: true, result: [] } };
      return { data: { result: { value: 'off' } } };
    });
    let stalledSignal: AbortSignal | undefined, recoverySignal: AbortSignal | undefined;
    vi.mocked(axios.put)
      .mockImplementationOnce(
        (_url, _body, options) =>
          new Promise((_resolve, reject) => {
            stalledSignal = options!.signal as AbortSignal;
            stalledSignal.addEventListener(
              'abort',
              () => reject(new Error('Configuration deadline expired')),
              { once: true }
            );
          })
      )
      .mockImplementation(async (_url, _body, options) => {
        recoverySignal = options!.signal as AbortSignal;
        return success;
      });
    vi.mocked(axios.patch).mockResolvedValue(success);
    const controller = new SettingsController(
      { updateCloudflareConfig: vi.fn() } as never,
      { getAllVideosData: async () => [] } as never,
      service,
      {} as never
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    try {
      await expect(
        withCloudflareDeadline(
          () =>
            withSettingsChange(state.config.paths.nodeSettingsPath, () =>
              service.withConfigurationRollback('email', 'zone', 'key', () =>
                service.setCdnConfiguration('email', 'zone', 'key')
              )
            ),
          50
        )
      ).rejects.toThrow('previous zone configuration was restored');
      expect(stalledSignal!.aborted).toBe(true);
      expect(recoverySignal).not.toBe(stalledSignal);
      expect(recoverySignal!.aborted).toBe(false);
      await expect(
        withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
      ).resolves.toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('respects origin freshness on Free without a sub-minimum TTL override', async () => {
    vi.mocked(axios.put).mockResolvedValue(success);
    vi.mocked(axios.patch).mockResolvedValue(success);
    await service.setCdnConfiguration('email', 'zone', 'key');
    const rules = (vi.mocked(axios.put).mock.calls[0][1] as any).rules;
    const media = rules.find((rule: any) => rule.description === 'Node External - Video');
    const hls = rules.find((rule: any) => rule.description.includes('HLS'));
    expect(media.expression).toContain('"/external/videos/"');
    expect(media.action_parameters.edge_ttl).toEqual({ mode: 'bypass_by_default' });
    expect(hls.action_parameters.edge_ttl.mode).toBe('bypass_by_default');
    expect(
      rules.some((rule: any) => rule.action_parameters.edge_ttl?.mode === 'override_origin')
    ).toBe(false);
    expect(rules.at(-1).action_parameters.cache).toBe(false);
    expect(rules.length).toBeLessThanOrEqual(10);
  });
  it.each([false, true])(
    'an older completion cannot acknowledge a newer purge generation (reversed=%s)',
    async (reversed) => {
      let finish!: (value: unknown) => void;
      post.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const purge = (files: string[]) => (service as any).purgeCache(files, 'regression');
      const first = purge(['https://node.example.com/old']);
      const firstRejected = expect(first).rejects.toThrow('incomplete');
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      const second = purge(['https://node.example.com/old']);
      const rejected = expect(second).rejects.toThrow('incomplete');
      await vi.waitFor(() => expect((service as any).purgeGeneration).toBe(2));
      if (reversed) {
        await rejected;
        finish(success);
        await firstRejected;
      } else {
        finish(success);
        await firstRejected;
        await rejected;
      }
      await purge(['https://node.example.com/new']);
      expect(post).toHaveBeenCalledTimes(2);
      expect(post.mock.calls[1][1].files).toEqual(
        expect.arrayContaining(['https://node.example.com/old', 'https://node.example.com/new'])
      );
      expect((service as any).pendingPurges.get('zone').size).toBe(0);
    }
  );
  it('retries one covering adaptive prefix after strict failure without inventory dependencies', async () => {
    const inventory = vi
      .spyOn(service, 'getAdaptiveVideoUrls')
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValue(['https://node.example.com/segment.ts']);
    post.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(service.purgeAdaptiveVideos('video', undefined, true)).rejects.toThrow(
      'incomplete'
    );
    expect(post.mock.calls[0][1]).toEqual({
      prefixes: ['externalvideos.node.example.com/external/videos/video/adaptive/'],
    });
    await expect(service.purgeAdaptiveVideos('video', undefined, true)).resolves.toBeUndefined();
    expect(inventory).not.toHaveBeenCalled();
    expect((service as any).pendingPurges.get('zone').size).toBe(0);
  });
  it.each(['filesystem', 's3provider'] as const)(
    'rejects nested CDN hostnames for %s before querying certificate exceptions',
    async (storageMode) => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { success: true, result: { name: 'example.com' } },
      });
      await expect(
        service.validateCdnConfiguration('email', 'zone', 'key', {
          publicNodeAddress: 'node.example.com',
          storageConfig:
            storageMode === 'filesystem'
              ? { storageMode }
              : {
                  storageMode,
                  s3Config: {
                    bucketName: 'externalvideos.node.example.com',
                    s3ProviderClientConfig: {
                      region: 'us-east-1',
                      forcePathStyle: false,
                      credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
                    },
                  },
                },
        })
      ).rejects.toThrow('zone root exactly');
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone'),
        expect.anything()
      );
    }
  );
  it.each(['filesystem', 's3provider'] as const)(
    'accepts the selected zone root for %s without a nested-host certificate lookup',
    async (storageMode) => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { success: true, result: { name: 'example.com' } },
      });
      await expect(
        service.validateCdnConfiguration('email', 'zone', 'key', {
          publicNodeAddress: 'Example.COM.',
          storageConfig:
            storageMode === 'filesystem'
              ? { storageMode }
              : {
                  storageMode,
                  s3Config: {
                    bucketName: 'externalvideos.example.com',
                    s3ProviderClientConfig: {
                      region: 'us-east-1',
                      forcePathStyle: false,
                      credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
                    },
                  },
                },
        })
      ).resolves.toBeUndefined();
      expect(axios.get).toHaveBeenCalledTimes(1);
    }
  );
  it('shares the transition signal and gives recovery a fresh bounded signal', async () => {
    await withCloudflareDeadline(async () => {
      const initial = cloudflareOptions({}).signal!;
      await withCloudflareDeadline(async () => expect(cloudflareOptions({}).signal).toBe(initial));
      await new Promise<void>((resolve) =>
        initial.addEventListener('abort', () => resolve(), { once: true })
      );
      expect(initial.aborted).toBe(true);
      await withCloudflareRecovery(async () => {
        expect(cloudflareOptions({}).signal).not.toBe(initial);
        expect(cloudflareOptions({}).signal!.aborted).toBe(false);
      });
    }, 20);
  });
  it('reports an unusable base URL to strict callers and retains failed segment purges', async () => {
    state.config.getExternalVideosBaseUrl = () => {
      throw new Error('Invalid URL');
    };
    await expect(service.purgeAdaptiveVideos('video', undefined, true)).rejects.toThrow(
      'Invalid URL'
    );
    state.config.getExternalVideosBaseUrl = () => 'https://externalvideos.node.example.com';
    post.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(
      service.purgeAdaptiveVideos('video', '11111111-1111-4111-8111-111111111111', true)
    ).rejects.toThrow('incomplete');
    await withCloudflareDeadline(() => service.purgeWatchPages(['video'], true));
    expect(post.mock.calls.at(-1)![2]).toEqual({ signal: expect.any(AbortSignal) });
  });
});
