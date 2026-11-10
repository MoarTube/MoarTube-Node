import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import { VideosController } from '@/controllers/videos.js';
import { installCachePolicy } from '@/plugins/cache-policy.js';
import {
  cacheableMediaRequest,
  mediaCacheOrigins,
  mediaVariantBypass,
} from '@/utils/media-cache.js';
import { operationalConfig } from '@/database/operational.js';
import { purgeOutbox } from '@/utils/purge-outbox.js';

const cfg = vi.hoisted(() => ({ value: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => cfg.value }));
vi.mock('axios');
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let root: string, post: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'moartube-media-variants-'));
  cfg.value = {
    paths: { nodeSettingsPath: path.join(root, 'settings.json') },
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
      cloudflareZoneId: 'zone',
    },
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
  post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('direct-storage invalidation strictly purges every cacheable Origin identity in one file request', async () => {
  const cdn = new CloudflareService(logger as never, {} as never);
  const controller = new VideosController({} as never, {} as never, {} as never, cdn, {} as never);
  const app = Fastify();
  app.post('/videos/:videoId/invalidate', controller.invalidateCache);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/videos/one/invalidate',
      payload: { paths: ['images/preview.jpg'] },
    });
    expect(response.statusCode).toBe(200);
    const url = 'https://media.example/external/videos/one/images/preview.jpg';
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![1].files).toHaveLength(2);
    expect(post.mock.calls[0]![1].files).toEqual(
      expect.arrayContaining([url, { url, headers: { Origin: 'https://node.example' } }])
    );
  } finally {
    await app.close();
  }
});

it('only canonical media variants are promoted at the Node origin', async () => {
  const app = Fastify();
  installCachePolicy(app);
  app.get('/external/videos/one/file', (_req, reply) =>
    reply.header('Cache-Control', 'public, max-age=0, s-maxage=30').send('bytes')
  );
  try {
    for (const request of [
      { url: '/external/videos/one/file?tracking=1' },
      { url: '/external/videos/one/file', headers: { origin: 'https://other.example' } },
      {
        url: '/external/videos/one/file',
        headers: { origin: 'https://node.example, https://other.example' },
      },
      { url: '/external/videos/one/file', headers: { 'x-forwarded-host': 'other.example' } },
    ])
      expect((await app.inject(request)).headers['cache-control'], JSON.stringify(request)).toBe(
        'no-store'
      );
    // light-my-request normalizes an empty query marker before constructing the request.
    expect(cacheableMediaRequest('/external/videos/one/file?', {})).toBe(false);
    for (const headers of [{}, { origin: 'https://node.example' }])
      expect(
        (await app.inject({ url: '/external/videos/one/file', headers })).headers['cache-control']
      ).toContain('s-maxage=30');
  } finally {
    await app.close();
  }
});

it('bypasses arbitrary key variants on direct S3 without paid custom-key features', () => {
  const cdn = new CloudflareService(logger as never, {} as never);
  const rules = cdn.managedCdnSnapshot().rules ?? [];
  expect(rules.length).toBeLessThanOrEqual(10);
  expect(rules.some((rule) => rule['expression'] === mediaVariantBypass())).toBe(true);
  expect(mediaVariantBypass()).toContain('len(http.request.headers["origin"]) gt 1');
  expect(mediaVariantBypass()).toContain('http.request.uri contains "?"');
  expect(mediaVariantBypass()).toContain('https://node.example');
  expect(mediaVariantBypass()).toContain('x-original-url');
  cfg.value.getNodeBaseUrl = () => 'http://node.example:8080';
  expect(mediaCacheOrigins()).toEqual(['http://node.example:8080', 'https://node.example:8080']);
});

it('renews a dispatch lease and prevents its former owner from releasing a replacement lease', async () => {
  const journal = purgeOutbox(operationalConfig(cfg.value));
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const first = await journal.claim('zone:files');
    expect(first).toBeDefined();
    now += 100_000;
    expect(await first!.renew()).toBe(true);
    now += 30_000;
    expect(await journal.claim('zone:files')).toBeUndefined();
    now += 100_000;
    const replacement = await journal.claim('zone:files');
    expect(replacement).toBeDefined();
    expect(await first!.renew()).toBe(false);
    await first!.release();
    expect(await journal.claim('zone:files')).toBeUndefined();
    await replacement!.release();
    expect(await journal.claim('zone:files')).toBeDefined();
  } finally {
    await journal.close();
  }
});

it('shares the Free burst budget across credential changes and drains queued work after refill', async () => {
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  for (let i = 0; i < 25; i++) {
    cfg.value.nodeSettings.cloudflareEmailAddress = 'account-' + i;
    const service = new CloudflareService(logger as never, {} as never);
    await service.purgePrefixes(['https://media.example/videos/' + i], true);
  }
  const service = new CloudflareService(logger as never, {} as never);
  await expect(
    service.purgePrefixes(['https://media.example/videos/queued'], true)
  ).rejects.toThrow('incomplete');
  expect(post).toHaveBeenCalledTimes(25);
  now += 12_001;
  await service.retryPendingPurges();
  expect(post).toHaveBeenCalledTimes(26);
});

it('strict concurrent direct writes join dispatch without a synthetic completion failure', async () => {
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const release = new Promise<void>((resolve) => {
    finish = resolve;
  });
  post.mockImplementationOnce(async () => {
    started();
    await release;
    return { data: { success: true } };
  });
  const first = new CloudflareService(logger as never, {} as never);
  const second = new CloudflareService(logger as never, {} as never);
  const a = first.purgeFiles(['https://media.example/external/videos/one/a.ts'], true);
  await entered;
  const b = second.purgeFiles(['https://media.example/external/videos/one/b.ts'], true);
  finish();
  await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  expect(post).toHaveBeenCalledTimes(2);
  const journal = purgeOutbox(operationalConfig(cfg.value));
  try {
    expect(await journal.snapshot('zone')).toEqual([]);
  } finally {
    await journal.close();
  }
});

it('honors an exhausted API-wide quota across both purge lanes and process handles', async () => {
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  post.mockRejectedValueOnce({
    response: {
      status: 429,
      headers: {
        'retry-after': '1',
        ratelimit: '"default";r=0;t=120',
      },
    },
  });
  const first = new CloudflareService(logger as never, {} as never);
  await expect(
    first.purgePrefixes(['https://media.example/external/videos/one/'], true)
  ).rejects.toThrow();
  const next = new CloudflareService(logger as never, {} as never);
  const file = 'https://media.example/external/videos/two/a.ts';
  await expect(next.purgeFiles([file], true)).rejects.toThrow();
  now += 2000;
  await expect(next.purgeFiles([file], true)).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
  now += 120_001;
  await expect(next.purgeFiles([file], true)).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledTimes(3);
});

it('keeps non-playlist metadata in static manifest directories on the short policy', async () => {
  const { mediaObjectCacheControl } = await import('@/utils/media-cache.js');
  expect(mediaObjectCacheControl('external/videos/id/static/manifests/metadata.json')).toContain('s-maxage=30');
});
it('normalizes China, government and default AWS endpoints without treating signing choices as storage changes', async () => {
  const { storageIdentity } = await import('@/utils/cdn-settings.js');
  const store = (region?: string, endpoint?: string) => ({ storageMode: 's3provider', s3Config: { bucketName: 'bucket', s3ProviderClientConfig: { region, endpoint } } } as never);
  expect(storageIdentity(store('cn-north-1'))).toContain('aws-cn');
  expect(storageIdentity(store('us-gov-west-1'))).toContain('aws-us-gov');
  expect(storageIdentity(store('us-east-1', 'https://s3.amazonaws.com/custom'))).toContain('custom');
  expect(storageIdentity({ storageMode: 's3provider' } as never)).toContain('aws-s3');
});
