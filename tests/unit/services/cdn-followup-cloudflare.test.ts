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
  it('surfaces an EACCES inventory error through the invalidation endpoint while purging known playlists', async () => {
    vi.spyOn(service, 'getAdaptiveVideoUrls')
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
      ).toBe(500);
      expect(post.mock.calls.flatMap((call) => call[1].files)).toContain(
        'https://externalvideos.node.example.com/external/videos/video/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8'
      );
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
      if (url.includes('entrypoint')) return { data: { result: { id: 'previous', rules: [] } } };
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
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    try {
      await withCloudflareDeadline(
        () =>
          controller.cloudflareConfigure(
            {
              body: {
                cloudflareEmailAddress: 'email',
                cloudflareZoneId: 'zone',
                cloudflareGlobalApiKey: 'key',
              },
            } as never,
            reply as never
          ),
        50
      );
      expect(stalledSignal!.aborted).toBe(true);
      expect(recoverySignal).not.toBe(stalledSignal);
      expect(recoverySignal!.aborted).toBe(false);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ isError: true, message: expect.stringContaining('restored') })
      );
      await expect(
        withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
      ).resolves.toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('keeps the legacy-media fallback narrow, ordered and limited to successful responses', async () => {
    vi.mocked(axios.put).mockResolvedValue(success);
    vi.mocked(axios.patch).mockResolvedValue(success);
    await service.setCdnConfiguration('email', 'zone', 'key');
    const rules = (vi.mocked(axios.put).mock.calls[0][1] as any).rules;
    const legacy = rules[0],
      broad = rules[1],
      hls = rules.find((rule: any) => rule.description.includes('HLS'));
    expect(legacy.description).toContain('Legacy');
    expect(legacy.expression).toContain('"/external/videos/"');
    for (const extension of ['ts', 'mp4', 'webm', 'ogv', 'jpg']) {
      expect(legacy.expression).toContain('"' + extension + '"');
      expect(broad.expression).toContain('"' + extension + '"');
    }
    expect(broad.expression).toContain('not http.request.uri.path.extension');
    expect(legacy.action_parameters.edge_ttl).toEqual({
      mode: 'override_origin',
      default: 30,
      status_code_ttl: [
        { status_code_range: { to: 199 }, value: -1 },
        { status_code_range: { from: 201, to: 599 }, value: -1 },
      ],
    });
    expect(hls.action_parameters.edge_ttl.mode).toBe('bypass_by_default');
    expect(legacy.expression).not.toContain('"m3u8"');
    expect(rules.at(-1).action_parameters.cache).toBe(false);
    expect(rules.length).toBeLessThanOrEqual(10);
  });
  it.each([false, true])(
    'an older completion cannot acknowledge a newer purge generation (reversed=%s)',
    async (reversed) => {
      let finish!: (value: unknown) => void, fail!: (error: unknown) => void;
      post
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              fail = reject;
            })
        );
      const purge = (files: string[]) => (service as any).purgeCache(files, 'regression');
      const first = purge(['https://node.example.com/old']);
      const second = purge(['https://node.example.com/old']);
      const rejected = expect(second).rejects.toThrow('incomplete');
      if (reversed) {
        fail({ response: { status: 403 } });
        await rejected;
        finish(success);
        await first;
      } else {
        finish(success);
        await first;
        fail({ response: { status: 403 } });
        await rejected;
      }
      await purge(['https://node.example.com/new']);
      expect(post.mock.calls[2][1].files).toEqual(
        expect.arrayContaining(['https://node.example.com/old', 'https://node.example.com/new'])
      );
      expect((service as any).pendingPurges.get('zone').size).toBe(0);
    }
  );
  it('submits known playlists before inventory failure, reports strict failure and retries inventory', async () => {
    const inventory = vi
      .spyOn(service, 'getAdaptiveVideoUrls')
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValue(['https://node.example.com/segment.ts']);
    await expect(service.purgeAdaptiveVideos('video', undefined, true)).rejects.toThrow();
    expect(post.mock.calls.flatMap((call) => call[1].files)).toContain(
      'https://externalvideos.node.example.com/external/videos/video/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8'
    );
    await expect(service.purgeAdaptiveVideos('video', undefined, true)).resolves.toBeUndefined();
    expect(inventory).toHaveBeenCalledTimes(2);
    expect((service as any).pendingAdaptiveInventories.get('zone').size).toBe(0);
  });
  it.each([
    { status: 'active', hosts: ['externalvideos.node.example.com'] },
    { status: 'active', hosts: ['*.node.example.com'], expires_on: '2999-01-01' },
  ])('accepts active exact or one-label wildcard certificate coverage: %j', async (certificate) => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, result: { name: 'example.com' } } })
      .mockResolvedValueOnce({ data: { success: true, result: [certificate] } });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', {
        publicNodeAddress: 'node.example.com',
        storageConfig: {
          storageMode: 's3provider',
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
    ).resolves.toBeUndefined();
  });
  it('checks paginated packs and uploaded certificates and rejects expired, pending and shallow wildcard certificates', async () => {
    const settings = {
      publicNodeAddress: 'node.example.com',
      storageConfig: {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'externalvideos.node.example.com',
          s3ProviderClientConfig: {
            region: 'us-east-1',
            forcePathStyle: false,
            credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
          },
        },
      },
    } as const;
    const invalid = [
      { status: 'pending', hosts: ['externalvideos.node.example.com'] },
      { status: 'active', hosts: ['*.example.com'] },
      { status: 'active', hosts: ['externalvideos.node.example.com'], expires_on: '2000-01-01' },
      { status: 'active' },
    ];
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, result: { name: 'example.com' } } })
      .mockResolvedValueOnce({
        data: { success: true, result: invalid, result_info: { total_pages: 2 } },
      })
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({
        data: {
          success: true,
          result: [{ status: 'active', hosts: ['externalvideos.node.example.com'] }],
        },
      });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', settings)
    ).resolves.toBeUndefined();
    expect(axios.get).toHaveBeenLastCalledWith(
      expect.stringContaining('custom_certificates'),
      expect.objectContaining({ timeout: 10_000 })
    );
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, result: { name: 'example.com' } } })
      .mockResolvedValue({ data: { success: true, result: invalid } });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', settings)
    ).rejects.toThrow('active edge certificate');
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, result: { name: 'example.com' } } })
      .mockResolvedValueOnce({ data: { success: false } });
    await expect(
      service.validateCdnConfiguration('email', 'zone', 'key', settings)
    ).rejects.toThrow('verify Cloudflare certificate');
  });
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
    post.mockResolvedValueOnce(success).mockRejectedValueOnce({ response: { status: 403 } });
    await expect(
      service.purgeAdaptiveVideos(
        'video',
        ['https://externalvideos.node.example.com/segment.ts'],
        true
      )
    ).rejects.toThrow('incomplete');
    await withCloudflareDeadline(() => service.purgeWatchPages(['video'], true));
    expect(post.mock.calls.at(-1)![2]).toEqual({ signal: expect.any(AbortSignal) });
  });
});
