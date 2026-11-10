import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { Readable } from 'node:stream';
import { installCachePolicy } from '@/plugins/cache-policy.js';
import { servePublicFile } from '@/utils/public-file.js';
import { assetUrl } from '@/utils/asset-url.js';
import { CloudflareService } from '@/services/cloudflare.js';
import { VideosService } from '@/services/videos.js';
import { VideoUploadService } from '@/services/video-upload.js';
import { StreamsService } from '@/services/streams.js';
import { HomeController } from '@/controllers/home.js';
import { SettingsController } from '@/controllers/settings.js';
import { migrateStorage } from '@/services/storage-migration.js';

const config = vi.hoisted(() => ({ current: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => config.current }));
vi.mock('axios');
vi.mock('@/services/storage-migration.js', () => ({ migrateStorage: vi.fn() }));
vi.mock('@/utils/distribution-admission.js', () => ({
  withDistributionTransition: (operation: () => unknown) => operation(),
}));
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'moartube-cache-contract-'));
  config.current = {
    paths: {
      dataDirectoryPath: path.join(root, 'data'),
      publicDirectoryPath: root,
      videosDirectoryPath: path.join(root, 'videos'),
    },
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
      storageConfig: { storageMode: 'filesystem' },
    },
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('keeps private responses, mutations, authorization, cookies and errors out of browser caches', async () => {
  const app = Fastify();
  installCachePolicy(app);
  app.get('/settings', async () => ({ secret: 'private' }));
  app.route({
    method: ['GET', 'HEAD', 'POST'],
    url: '/public',
    handler: (_req, reply) =>
      reply
        .header('Cache-Control', 'public, s-maxage=30')
        .header('Cache-Tag', 'public')
        .send('body'),
  });
  app.get('/error', (_req, reply) =>
    reply.header('Cache-Control', 'public').status(500).send('failure')
  );
  app.get('/cookie', (_req, reply) =>
    reply.header('Cache-Control', 'public').header('Set-Cookie', 'session=test').send('body')
  );
  try {
    for (const request of [
      { url: '/settings' },
      { url: '/public', method: 'POST' as const },
      { url: '/public', headers: { authorization: 'Bearer test' } },
      { url: '/error' },
      { url: '/cookie' },
    ]) {
      const response = await app.inject(request);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await app.inject('/public')).headers['cache-control']).toContain('s-maxage=30');
  } finally {
    await app.close();
  }
});

it('retains immutable release assets and never serves changed bytes under an old hash', async () => {
  await mkdir(path.join(root, 'javascript'));
  const file = path.join(root, 'javascript', 'app.js');
  await writeFile(file, 'original');
  const old = assetUrl('/external/resources/javascript/app.js');
  expect(old).toMatch(/\?v=[a-f0-9]{64}$/);
  const app = Fastify();
  installCachePolicy(app);
  app.get('/external/resources/javascript/app.js', (req, reply) =>
    servePublicFile(req, reply, root, ['javascript', 'app.js'], 'application/javascript')
  );
  try {
    const response = await app.inject(old);
    expect(response.body).toBe('original');
    expect(response.headers['cache-control']).toContain('max-age=31536000');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(
      (await app.inject({ url: old, headers: { 'if-none-match': String(response.headers.etag) } }))
        .statusCode
    ).toBe(304);
    await writeFile(file, 'replacement bytes');
    const next = assetUrl('/external/resources/javascript/app.js');
    expect(next).not.toBe(old);
    expect((await app.inject(old)).statusCode).toBe(200);
    expect((await app.inject(old)).body).toBe('original');
    expect((await app.inject(next)).body).toBe('replacement bytes');
    expect(
      (await app.inject('/external/resources/javascript/app.js')).headers['cache-control']
    ).toContain('max-age=0');
  } finally {
    await app.close();
  }
});

it('tags root query variants and purges HTML without evicting comment prefixes', async () => {
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  const cdn = new CloudflareService(logger as never);
  const app = Fastify();
  const home = new HomeController({ state: async () => ({}), settings: () => ({}) } as never);
  app.decorateReply('view', function () {
    return this.send('html');
  });
  app.get('/', home.page);
  try {
    for (const url of ['/', '/?view=community', '/?searchTerm=music']) {
      expect((await app.inject(url)).headers['cache-tag']).toBe('moartube-home');
    }
    await cdn.purgeHomePage();
    await cdn.purgeWatchPages(['one']);
    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { tags: ['moartube-home'] },
      { tags: ['moartube-video-one'] },
    ]);
  } finally {
    await app.close();
  }
});

it('does not purge views or new segments, but purges replacements', async () => {
  const cdn = { purgeHomePage: vi.fn(), purgeFiles: vi.fn(), isEnabled: () => true };
  const videos = new VideosService(
    logger as never,
    { incrementViews: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    cdn as never
  );
  await videos.incrementViews('one');
  expect(cdn.purgeHomePage).not.toHaveBeenCalled();
  const upload = new VideoUploadService({} as never, cdn as never, {} as never, logger as never);
  const folder = path.join(root, 'videos', 'one', 'adaptive', 'm3u8', '720p');
  const file = () => ({ filename: 'generation-1.ts', file: Readable.from(['bytes']) });
  await upload.saveUploadedFile(file() as never, folder);
  expect(cdn.purgeFiles).not.toHaveBeenCalled();
  await upload.saveUploadedFile(file() as never, folder);
  expect(cdn.purgeFiles).toHaveBeenCalledExactlyOnceWith([
    'https://media.example/external/videos/one/adaptive/m3u8/720p/segments/generation-1.ts',
  ]);
});

it('deleting one segment does not inventory or purge the entire stream', async () => {
  const cdn = { purgeFiles: vi.fn(), purgeAdaptiveVideos: vi.fn() };
  await StreamsService.prototype.invalidateStreamMedia.call(
    { cloudflareService: cdn } as any,
    'one',
    { format: 'm3u8', resolution: '720p', segmentName: 'old.ts' }
  );
  expect(cdn.purgeAdaptiveVideos).not.toHaveBeenCalled();
  expect(cdn.purgeFiles).toHaveBeenCalledWith([
    'https://media.example/external/videos/one/adaptive/m3u8/720p/segments/old.ts',
  ]);
});

it.each(['1', '120', new Date(Date.now() + 120000).toUTCString()])(
  'persists final-attempt Retry-After %s before ending retries',
  async (retryAfter) => {
    const post = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': retryAfter } } })
      .mockResolvedValue({ data: { success: true } });
    vi.mocked(axios.create).mockReturnValue({ post } as never);
    const cdn = new CloudflareService(logger as never);
    await expect(cdn.purgeFiles(['https://node.example/file'], true)).rejects.toThrow();
    await expect(cdn.retryPendingPurges()).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(3);
  }
);

it('rejects migration into the active serving destination before copying, including credential aliases', async () => {
  const s3 = {
    bucketName: 'active',
    s3ProviderClientConfig: {
      region: 'us-east-1',
      endpoint: 'https://s3.example',
      forcePathStyle: false,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    },
  };
  const controller = new SettingsController({} as never, {} as never, {} as never, {} as never);
  const app = Fastify();
  installCachePolicy(app);
  app.post('/migrate', controller.migrateStorage);
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/migrate',
          payload: { direction: 's3-to-filesystem', source: s3 },
        })
      ).statusCode
    ).toBe(409);
    config.current.nodeSettings.storageConfig = { storageMode: 's3provider', s3Config: s3 };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/migrate',
          payload: {
            direction: 'filesystem-to-s3',
            destination: {
              ...s3,
              s3ProviderClientConfig: {
                ...s3.s3ProviderClientConfig,
                credentials: { accessKeyId: 'other', secretAccessKey: 'other' },
              },
            },
          },
        })
      ).statusCode
    ).toBe(409);
    expect(migrateStorage).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
