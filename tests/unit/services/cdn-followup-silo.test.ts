import { operationalForPath, writeRecovery } from '@/database/recovery.js';
import { writeCdnJournal } from '@/utils/cdn-journal.js';
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({
  requestTunnelOperation: vi.fn(async () => ({ mode: 'none', status: 'stopped', name: '' })),
}));
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import { VideosController } from '@/controllers/videos.js';
import { buildExternalVideosBaseUrl } from '@/config/urls.js';
import { StreamsController } from '@/controllers/streams.js';
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';
import { StorageService } from '@/services/storage.js';
import { StreamsService } from '@/services/streams.js';
import { VideosService } from '@/services/videos.js';
import { SettingsController } from '@/controllers/settings.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import { withCloudflareDeadline } from '@/utils/cloudflare-http.js';

const state = vi.hoisted(() => ({ config: {} as any, base: 'https://new.example' }));
vi.mock('@config/index.js', () => ({ getConfig: () => state.config }));
vi.mock('axios');
let a: SiloFixture, b: SiloFixture, root: string, storage: StorageService, streams: StreamsService;
let video: any;
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
let repository: any;
let cloudflare: any;
const prefix = 'external/videos/video123/adaptive/m3u8/';
beforeAll(async () => {
  a = await siloFixture();
  b = await siloFixture();
});
afterAll(async () => {
  await a.close();
  await b.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  for (const fixture of [a, b]) {
    const page = await fixture.client.send(
      new ListObjectsV2Command({ Bucket: fixture.config.bucketName })
    );
    if (page.Contents?.length)
      await fixture.client.send(
        new DeleteObjectsCommand({
          Bucket: fixture.config.bucketName,
          Delete: { Objects: page.Contents.map((object) => ({ Key: object.Key! })) },
        })
      );
  }
  root = await mkdtemp(path.join(tmpdir(), 'moartube-cdn-followup-'));
  state.config = {
    paths: {
      dataDirectoryPath: root,
      nodeSettingsPath: path.join(root, 'settings.json'),
      videosDirectoryPath: path.join(root, 'videos'),
      publicDirectoryPath: path.join(root, 'public'),
    },
    nodeSettings: {
      storageConfig: { storageMode: 's3provider', s3Config: a.config },
      isCloudflareCdnEnabled: false,
      publicNodeAddress: 'example.com',
      publicNodeProtocol: 'https',
      publicNodePort: '443',
    },
    reloadNodeSettings: vi.fn(),
    getExternalVideosBaseUrl: () => state.base,
    getNodeBaseUrl: () => 'https://example.com',
  };
  state.config.nodeSettings.cloudflareEmailAddress = 'email';
  video = {
    video_id: 'video123',
    creation_timestamp: 123,
    is_published: true,
    is_stream_recorded_remotely: true,
    is_streaming: false,
    is_live: true,
    outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
    meta: JSON.stringify({ streamGeneration: 'run-one' }),
  };
  repository = {
    findById: vi.fn(async () => video),
    findAll: vi.fn(async () => (video ? [video] : [])),
    update: vi.fn(async (_id, patch) => {
      video = { ...video, ...patch };
      return video;
    }),
    delete: vi.fn(async () => {
      video = undefined;
      return true;
    }),
  };
  cloudflare = {
    purgePrefixes: vi.fn(),
    purgeComments: vi.fn(),
    purgeAdaptiveVideos: vi.fn(),
    purgeVideo: vi.fn(),
    purgeWatchPages: vi.fn(),
    purgeAllWatchPages: vi.fn(),
    purgeEmbedVideoPages: vi.fn(),
    purgeHomePage: vi.fn(),
    purgeProgressiveVideos: vi.fn(),
    purgeVideoThumbnailImages: vi.fn(),
    purgeVideoPreviewImages: vi.fn(),
    purgeVideoPosterImages: vi.fn(),
    getAdaptiveVideoUrls: vi.fn(async () => []),
  };
  storage = new StorageService(logger as never);
  streams = new StreamsService(
    logger as never,
    repository,
    { deleteByVideoId: async () => 0 } as never,
    { deleteByVideoId: async () => 0 } as never,
    { broadcastToNodes: () => {} } as never,
    cloudflare,
    storage
  );
});
afterEach(async () => {
  streams.close();
  storage.close();
  await rm(root, { recursive: true, force: true });
});

async function seed(recorded = true): Promise<void> {
  video.is_stream_recorded_remotely = recorded;
  video.is_streaming = true;
  await a.put(prefix + '720p/segments/run-one-0.ts', 'first stream bytes');
  await a.put(
    prefix + 'dynamic/manifests/manifest-720p.m3u8',
    '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:2,\n../../720p/segments/run-one-0.ts\n'
  );
  await a.put(
    prefix + 'dynamic/manifests/manifest-master.m3u8',
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n'
  );
}

async function expireJournal(): Promise<void> {
  streams.close();
  const db = operationalForPath(state.config.paths.nodeSettingsPath);
  const row = (
    await db.query("SELECT key,value FROM node_recovery WHERE key LIKE 'cleanup:%'")
  )[0]!;
  await db.close();
  const job = JSON.parse(row.value as string);
  job.deadline = Date.now() - 1;
  const meta = JSON.parse(video.meta);
  meta.streamCleanupAt = job.deadline;
  video.meta = JSON.stringify(meta);
  await writeRecovery(state.config.paths.nodeSettingsPath, row.key as string, JSON.stringify(job));
  streams = new StreamsService(
    logger as never,
    repository,
    { deleteByVideoId: async () => 0 } as never,
    {} as never,
    { broadcastToNodes: () => {} } as never,
    cloudflare,
    storage
  );
  await streams.recoverStreamCleanup();
  await vi.waitFor(async () => {
    const db = operationalForPath(state.config.paths.nodeSettingsPath);
    try {
      expect(
        await db.query("SELECT key FROM node_recovery WHERE key LIKE 'cleanup:%'")
      ).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
}

describe('follow-up storage fixes against real Silo', () => {
  it('marks validated S3 live masters, withdraws the marker on empty replacements, and preserves it only on active rewrites', async () => {
    const key = prefix + 'dynamic/manifests/manifest-master.m3u8';
    const head = () =>
      a.client.send(new HeadObjectCommand({ Bucket: a.config.bucketName, Key: key }));
    const master =
      '#EXTM3U\n#MOARTUBE-LIVE\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nmanifest-1080p.m3u8\n';
    await storage.writeS3MasterManifest('video123', 'dynamic', master);
    expect((await head()).CacheControl).toBe('public, max-age=0, s-maxage=1, must-revalidate');
    expect((await head()).Metadata?.['moartube-live-playlist']).toBe('active');
    await storage.removeS3Resolution('video123', 'm3u8', '720p');
    expect((await head()).Metadata?.['moartube-live-playlist']).toBe('active');
    await storage.removeS3Resolution('video123', 'm3u8', '1080p');
    expect((await head()).CacheControl).toBe('no-store');
    expect((await head()).Metadata?.['moartube-live-playlist']).toBeUndefined();
    await storage.writeS3MasterManifest('video123', 'dynamic', master);
    await storage.writeS3MasterManifest('video123', 'dynamic', '#EXTM3U\n#MOARTUBE-LIVE\n');
    expect((await head()).CacheControl).toBe('no-store');
    expect((await head()).Metadata?.['moartube-live-playlist']).toBeUndefined();
    // Rewriting an unmarked legacy object must not promote unknown lifecycle state.
    await a.put(key, master);
    await storage.removeS3Resolution('video123', 'm3u8', '720p');
    expect((await head()).CacheControl).toBe('no-store');
    expect((await head()).Metadata?.['moartube-live-playlist']).toBeUndefined();
  });
  it.each([true, false])(
    'withdraws active S3 metadata before completing a stream stop (recorded=%s)',
    async (recorded) => {
      await seed(recorded);
      const master =
        '#EXTM3U\n#MOARTUBE-LIVE\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n';
      await storage.writeS3MasterManifest('video123', 'dynamic', master);
      const rendition = prefix + 'dynamic/manifests/manifest-720p.m3u8';
      await a.client.send(
        new PutObjectCommand({
          Bucket: a.config.bucketName,
          Key: rendition,
          Body: await a.text(rendition),
          ContentType: 'application/vnd.apple.mpegurl',
          CacheControl: 'public, max-age=0, s-maxage=1, must-revalidate',
          Metadata: { 'moartube-live-playlist': 'active' },
        })
      );
      await streams.stopStream('video123');
      for (const name of ['720p', 'master']) {
        const object = await a.client.send(
          new HeadObjectCommand({
            Bucket: a.config.bucketName,
            Key: prefix + 'dynamic/manifests/manifest-' + name + '.m3u8',
          })
        );
        expect(object.CacheControl).toBe('no-store');
        expect(object.Metadata?.['moartube-live-playlist']).toBeUndefined();
      }
      expect(cloudflare.purgeAdaptiveVideos).toHaveBeenCalledWith('video123');
      if (recorded) {
        const vod = await a.client.send(
          new HeadObjectCommand({
            Bucket: a.config.bucketName,
            Key: prefix + 'static/manifests/manifest-720p.m3u8',
          })
        );
        expect(vod.CacheControl).toContain('s-maxage=31536000');
        expect(vod.Metadata?.['moartube-live-playlist']).toBeUndefined();
      }
    }
  );
  it.each([false, true])(
    'commits a regenerated S3 master before output confirmation purges its public cache (streaming=%s)',
    async (streaming) => {
      video.is_streaming = streaming;
      const type = streaming ? 'dynamic' : 'static';
      video.outputs = JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] });
      await a.put(prefix + type + '/manifests/manifest-master.m3u8', 'stale master');
      cloudflare.purgeVideo.mockImplementation(async () => {
        const master = await a.text(prefix + type + '/manifests/manifest-master.m3u8');
        expect(master).toContain('manifest-720p.m3u8');
        expect(master).not.toContain('stale master');
      });
      const videos = new VideosService(
        logger as never,
        repository,
        {} as never,
        storage,
        {} as never,
        cloudflare
      );
      await videos.markFormatResolutionPublished('video123', 'm3u8', '720p');
      expect(cloudflare.purgeVideo).toHaveBeenCalledWith('video123');
      expect(JSON.parse(video.outputs).m3u8).toEqual(['720p']);
    }
  );
  it('tolerates absent masters during withdrawal but propagates origin access failures', async () => {
    await storage.removeS3Resolution('video123', 'm3u8', '720p');
    state.config.nodeSettings.storageConfig.s3Config = {
      ...a.config,
      s3ProviderClientConfig: {
        ...a.config.s3ProviderClientConfig,
        credentials: { ...a.config.s3ProviderClientConfig.credentials, secretAccessKey: 'wrong' },
      },
    };
    await expect(storage.removeS3Resolution('video123', 'm3u8', '720p')).rejects.toThrow();
    state.config.nodeSettings.storageConfig.s3Config = a.config;
  });
  it('withdraws a rendition at the S3 origin and removes its master entry before cache refill', async () => {
    const master =
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nmanifest-1080p.m3u8\n';
    for (const type of ['static', 'dynamic']) {
      await a.put(prefix + type + '/manifests/manifest-master.m3u8', master);
      await a.put(prefix + type + '/manifests/manifest-720p.m3u8', 'withdrawn');
    }
    await a.put(prefix + '720p/segments/old.ts', 'old bytes');
    await a.put(prefix + '1080p/segments/retained.ts', 'retained bytes');
    await storage.removeS3Resolution('video123', 'm3u8', '720p');
    for (const type of ['static', 'dynamic']) {
      const updated = await a.text(prefix + type + '/manifests/manifest-master.m3u8');
      expect(updated).not.toContain('720p');
      expect(updated).not.toContain('BANDWIDTH=100');
      expect(updated).toContain('BANDWIDTH=200\nmanifest-1080p.m3u8');
      expect(await storage.fileExists(prefix + type + '/manifests/manifest-720p.m3u8')).toBe(false);
    }
    expect(await storage.fileExists(prefix + '720p/segments/old.ts')).toBe(false);
    expect(await a.text(prefix + '1080p/segments/retained.ts')).toBe('retained bytes');
    await a.put('external/videos/video123/progressive/mp4/720p.mp4', 'withdrawn');
    await storage.removeS3Resolution('video123', 'mp4', '720p');
    expect(await storage.fileExists('external/videos/video123/progressive/mp4/720p.mp4')).toBe(
      false
    );
  });
  it.each([true, false])(
    'stops an S3 stream before its first rendition arrives without publishing empty media (recorded=%s)',
    async (recorded) => {
      video.is_streaming = true;
      video.is_published = false;
      video.is_stream_recorded_remotely = recorded;
      // Client publishes the dynamic master before starting the live encoder.
      await a.put(
        prefix + 'dynamic/manifests/manifest-master.m3u8',
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n'
      );
      await streams.stopStream('video123');
      expect(video.is_streaming).toBe(false);
      expect(video.is_streamed).toBe(true);
      expect(video.is_published).toBe(false);
      expect(Number.isSafeInteger(JSON.parse(video.meta).streamCleanupAt)).toBe(true);
      await expireJournal();
      await expect(a.text(prefix + 'dynamic/manifests/manifest-master.m3u8')).rejects.toMatchObject(
        { $metadata: { httpStatusCode: 404 } }
      );
    }
  );
  it('stops a completely empty S3 startup under a distribution deadline', async () => {
    video.is_streaming = true;
    video.is_stream_recorded_remotely = false;
    await withCloudflareDeadline(() => streams.stopStream('video123'));
    expect(video.is_streaming).toBe(false);
    expect(video.is_published).toBe(false);
    await expireJournal();
  });
  it.each([true, false])(
    'does not publish an empty filesystem startup (recorded=%s)',
    async (recorded) => {
      state.config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
      video.is_streaming = true;
      video.is_published = false;
      video.is_stream_recorded_remotely = recorded;
      const folder = path.join(state.config.paths.videosDirectoryPath, 'video123/adaptive/m3u8');
      await mkdir(path.join(folder, '720p'), { recursive: true });
      await writeFile(
        path.join(folder, 'manifest-master.m3u8'),
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n'
      );
      await streams.stopStream('video123');
      expect(video.is_streaming).toBe(false);
      expect(video.is_published).toBe(false);
      expect(Number.isSafeInteger(JSON.parse(video.meta).streamCleanupAt)).toBe(true);
      await expireJournal();
      await expect(readFile(path.join(folder, 'manifest-master.m3u8'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  );
  it.each(['720p/segment.ts', 'segment.ts'])(
    'preserves partial filesystem media when its rendition is missing (%s)',
    async (segment) => {
      state.config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
      video.is_streaming = true;
      const file = path.join(
        state.config.paths.videosDirectoryPath,
        'video123/adaptive/m3u8',
        segment
      );
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, 'partial recording bytes');
      await expect(streams.stopStream('video123')).rejects.toThrow('missing');
      expect(video.is_streaming).toBe(true);
      expect(await readFile(file, 'utf8')).toBe('partial recording bytes');
    }
  );
  it('retains a stream with actual S3 media when a rendition is unexpectedly missing', async () => {
    await seed();
    await a.client.send(
      new DeleteObjectsCommand({
        Bucket: a.config.bucketName,
        Delete: { Objects: [{ Key: prefix + 'dynamic/manifests/manifest-720p.m3u8' }] },
      })
    );
    await expect(streams.stopStream('video123')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    expect(video.is_streaming).toBe(true);
    expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
  });
  it('preserves legacy recorded media whose output-resolution metadata is absent', async () => {
    await seed(true);
    video.outputs = '{}';
    await streams.stopStream('video123');
    expect(video.is_streaming).toBe(false);
    expect(video.is_published).toBe(true);
    expect(JSON.parse(video.meta).streamCleanupAt).toBeUndefined();
    expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
  });
  it('does not mistake a truncated S3 inventory for an empty startup', async () => {
    video.is_streaming = true;
    await Promise.all(
      ['one.ts', 'two.ts', 'three.ts'].map((name) => a.put(prefix + name, 'media'))
    );
    await expect(streams.stopStream('video123')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    expect(video.is_streaming).toBe(true);
  });
  it('does not hide an S3 inventory denial while checking an empty startup', async () => {
    video.is_streaming = true;
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, (req) => {
      if (new URL(req.url ?? '/', 'http://localhost').searchParams.has('list-type')) {
        req.headers.authorization = req.headers.authorization?.replace(
          /Signature=[a-f0-9]+/,
          'Signature=0'
        );
      }
    });
    state.config.nodeSettings.storageConfig.s3Config = {
      ...a.config,
      s3ProviderClientConfig: { ...a.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
    };
    try {
      await expect(streams.stopStream('video123')).rejects.toMatchObject({
        $metadata: { httpStatusCode: 403 },
      });
      expect(video.is_streaming).toBe(true);
    } finally {
      await proxy.close();
    }
  });
  it('propagates a rejected S3 finalization write instead of treating it as an empty startup', async () => {
    await seed();
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, (req) => {
      if (req.method === 'PUT') {
        req.headers.authorization = req.headers.authorization?.replace(
          /Signature=[a-f0-9]+/,
          'Signature=0'
        );
      }
    });
    state.config.nodeSettings.storageConfig.s3Config = {
      ...a.config,
      s3ProviderClientConfig: { ...a.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
    };
    try {
      await expect(streams.stopStream('video123')).rejects.toMatchObject({
        $metadata: { httpStatusCode: 403 },
      });
      expect(video.is_streaming).toBe(true);
      expect(await a.text(prefix + 'dynamic/manifests/manifest-720p.m3u8')).not.toContain(
        'ENDLIST'
      );
    } finally {
      await proxy.close();
    }
  });
  it('finalizes filesystem media without inventing a missing master', async () => {
    state.config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
    const folder = path.join(state.config.paths.videosDirectoryPath, 'video123/adaptive/m3u8');
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, 'manifest-720p.m3u8'),
      '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:2,\nsegment.ts\n'
    );
    await expect(streams.finalizeStreamManifests('video123')).resolves.toBe(10_000);
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toContain('ENDLIST');
    await expect(readFile(path.join(folder, 'manifest-master.m3u8'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('accepts a valid fractional viewer-drain advisory through the stop endpoint', async () => {
    await seed(false);
    const app = Fastify();
    const controller = new StreamsController({} as never, {} as never, streams);
    app.post('/streams/:videoId/stop', controller.stopStream);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/streams/video123/stop',
        payload: { drainSeconds: 90.0005 },
      });
      expect(response.statusCode).toBe(200);
      expect(video.is_streaming).toBe(false);
      expect(Number.isSafeInteger(JSON.parse(video.meta).streamCleanupAt)).toBe(true);
      expect(JSON.parse(video.meta).streamCleanupAt).toBeGreaterThan(Date.now() + 89_000);
      await expireJournal();
    } finally {
      await app.close();
    }
  });
  it('aborts a stalled real S3 inventory request and releases the transition lock', async () => {
    state.config.nodeSettings.isCloudflareCdnEnabled = true;
    state.config.nodeSettings.cloudflareGlobalApiKey = 'key';
    state.config.nodeSettings.cloudflareZoneId = 'zone';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, async (req) => {
      if (req.url?.includes('list-type=')) await gate;
    });
    state.config.nodeSettings.storageConfig = {
      storageMode: 's3provider',
      s3Config: {
        ...a.config,
        s3ProviderClientConfig: { ...a.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
      },
    };
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn().mockResolvedValue({ data: { success: true } }),
    } as never);
    const cdn = new CloudflareService(logger as never);
    try {
      await expect(
        withCloudflareDeadline(
          () =>
            withSettingsChange(state.config.paths.nodeSettingsPath, () =>
              cdn.getAdaptiveVideoUrls('video123')
            ),
          50
        )
      ).rejects.toThrow();
      await expect(
        withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
      ).resolves.toBe(true);
    } finally {
      release();
      await proxy.close();
    }
  });
  it('closes admission while the active-job scan is paused', async () => {
    video.is_published = false;
    let entered = false,
      release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    repository.findAll.mockImplementationOnce(async () => {
      entered = true;
      await gate;
      return [video];
    });
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    const controller = new SettingsController(
      { updateStorageConfig: vi.fn() } as never,
      videos,
      cloudflare,
      {} as never
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    const operation = controller.storageConfigToggle(
      { body: { storageConfig: state.config.nodeSettings.storageConfig } } as never,
      reply as never
    );
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
      await expect(videos.setPublishing('video123', true)).rejects.toThrow('in progress');
    } finally {
      release();
      await operation;
    }
    expect(reply.status).toHaveBeenLastCalledWith(200);
  });
  it('respects the new upload metadata and origin-controlled caching on Free', async () => {
    const fresh = prefix + '720p/segments/fresh.ts';
    await a.client.send(
      new PutObjectCommand({
        Bucket: a.config.bucketName,
        Key: fresh,
        Body: 'fresh',
        CacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable',
      })
    );
    expect(
      (await a.client.send(new HeadObjectCommand({ Bucket: a.config.bucketName, Key: fresh })))
        .CacheControl
    ).toContain('s-maxage=31536000');
    vi.mocked(axios.put).mockResolvedValue({ data: { success: true } });
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } });
    const cdn = new CloudflareService(logger as never);
    await cdn.setCdnConfiguration('email', 'zone', 'key');
    const rules = (
      vi
        .mocked(axios.put)
        .mock.calls.find(([url]) =>
          String(url).includes('/http_request_cache_settings/')
        )![1] as any
    ).rules;
    expect(rules[0].expression).toContain('"/external/videos/"');
    expect(rules[0].action_parameters.edge_ttl).toEqual({ mode: 'bypass_by_default' });
  });
  it('keeps an older viewer snapshot playable after the HTTP stop contract ends a non-recorded stream', async () => {
    await seed(false);
    const snapshot = await a.text(prefix + 'dynamic/manifests/manifest-720p.m3u8');
    const controller = new StreamsController({} as never, {} as never, streams);
    const app = Fastify();
    app.post('/streams/:videoId/stop', controller.stopStream);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing Node port');
    try {
      const response = await fetch(app.listeningOrigin + '/streams/video123/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drainSeconds: 86 }),
      });
      expect(await response.json()).toEqual({ isError: false });
      expect(snapshot).toContain('run-one-0.ts');
      expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
      expect(await a.text(prefix + 'dynamic/manifests/manifest-720p.m3u8')).toContain(
        '#EXT-X-ENDLIST'
      );
      expect(video.is_published).toBe(false);
      expect(JSON.parse(video.meta).streamCleanupAt).toBeGreaterThan(Date.now() + 80_000);
      await expireJournal();
      await expect(a.text(prefix + '720p/segments/run-one-0.ts')).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
  it('purges deleted video HTML tags after the row is removed', async () => {
    state.config.nodeSettings.isCloudflareCdnEnabled = true;
    state.config.nodeSettings.cloudflareGlobalApiKey = 'key';
    state.config.nodeSettings.cloudflareZoneId = 'zone';
    state.config.getNodeBaseUrl = () => 'https://node.example.com';
    const sent: string[] = [];
    const statuses: boolean[] = [];
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn(async (_url, body) => {
        sent.push(...(body.tags ?? []));
        statuses.push(video === undefined);
        return { data: { success: true } };
      }),
    } as never);
    const cdn = new CloudflareService(logger as never);
    const videos = new VideosService(
      logger as never,
      repository,
      { deleteByVideoId: async () => 0 } as never,
      storage,
      {} as never,
      cdn
    );
    await a.put('external/videos/video123/data', 'bytes');
    await videos.deleteVideo('video123');
    expect(sent).toEqual(expect.arrayContaining(['moartube-video-video123', 'moartube-home']));
    expect(statuses.every(Boolean)).toBe(true);
  });
  it('invalidates through one covering prefix independently of real S3 listing failures', async () => {
    state.config.nodeSettings.isCloudflareCdnEnabled = true;
    state.config.nodeSettings.cloudflareGlobalApiKey = 'key';
    state.config.nodeSettings.cloudflareZoneId = 'zone';
    state.config.getNodeBaseUrl = () => 'https://node.example.com';
    const keys = Array.from(
      { length: 1001 },
      (_, index) => prefix + '720p/segments/run-' + index + '.ts'
    );
    for (let offset = 0; offset < keys.length; offset += 32)
      await Promise.all(keys.slice(offset, offset + 32).map((key) => a.put(key, 'segment')));
    let deny = true,
      secondPages = 0;
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, (req) => {
      if (req.url?.includes('continuation-token=')) {
        secondPages++;
        if (deny) req.headers.authorization = (req.headers.authorization ?? '') + 'invalid';
      }
    });
    state.config.nodeSettings.storageConfig = {
      storageMode: 's3provider',
      s3Config: {
        ...a.config,
        s3ProviderClientConfig: { ...a.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
      },
    };
    const sent: string[] = [];
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn(async (_url, body) => {
        sent.push(...(body.prefixes ?? []));
        return { data: { success: true } };
      }),
    } as never);
    const cdn = new CloudflareService(logger as never);
    const controller = new VideosController(
      {} as never,
      {} as never,
      {} as never,
      cdn,
      {} as never
    );
    const app = Fastify();
    app.post('/videos/:videoId/cache/invalidate', controller.invalidateCache);
    try {
      await expect(cdn.getAdaptiveVideoUrls('video123')).rejects.toThrow();
      expect(secondPages).toBe(1);
      const invalidated = await app.inject({
        method: 'POST',
        url: '/videos/video123/cache/invalidate',
      });
      expect(invalidated.statusCode).toBe(200);
      expect(secondPages).toBe(1);
      expect(sent).toEqual([new URL(state.base).host + '/external/videos/video123/']);
      deny = false;
      const retried = await app.inject({
        method: 'POST',
        url: '/videos/video123/cache/invalidate',
      });
      expect(retried.statusCode).toBe(200);
      expect((await cdn.getAdaptiveVideoUrls('video123')).sort()).toEqual(
        keys.map((key) => state.base + '/' + key).sort()
      );
      for (const fault of ['missing', 'empty', 'repeated']) {
        const damaged = await siloProxy(
          a.config.s3ProviderClientConfig.endpoint,
          () => {},
          (req, incoming, res) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('end', () => {
              let body = Buffer.concat(chunks).toString();
              const cursor = new URL(req.url ?? '/', 'http://localhost').searchParams.get(
                'continuation-token'
              );
              if (fault === 'missing')
                body = body.replace(/<NextContinuationToken>[^<]*<\/NextContinuationToken>/g, '');
              else if (fault === 'empty')
                body = body.replace(
                  /<NextContinuationToken>[^<]*<\/NextContinuationToken>/g,
                  '<NextContinuationToken></NextContinuationToken>'
                );
              else if (cursor !== null)
                body = body.replace(
                  '<IsTruncated>false</IsTruncated>',
                  '<IsTruncated>true</IsTruncated><NextContinuationToken>' +
                    cursor +
                    '</NextContinuationToken>'
                );
              const headers = { ...incoming.headers };
              delete headers['content-length'];
              res.writeHead(incoming.statusCode ?? 502, headers);
              res.end(body);
            });
            return true;
          }
        );
        state.config.nodeSettings.storageConfig.s3Config.s3ProviderClientConfig.endpoint =
          damaged.endpoint;
        try {
          await expect(cdn.getAdaptiveVideoUrls('video123')).rejects.toThrow('continuation token');
          expect(
            (await app.inject({ method: 'POST', url: '/videos/video123/cache/invalidate' }))
              .statusCode
          ).toBe(200);
        } finally {
          await damaged.close();
        }
      }
    } finally {
      await app.close();
      await proxy.close();
    }
  }, 20_000);
  it('keeps relative playlists unchanged when switching from CDN to dotted-bucket AWS delivery', async () => {
    await seed();
    state.config.nodeSettings.isCloudflareTunnelEnabled = false;
    state.config.updateNodeSettings = (patch: object) => {
      Object.assign(state.config.nodeSettings, patch);
    };
    video.is_streaming = false;
    await storage.finalizeS3Stream('video123', ['720p'], true);
    state.config.nodeSettings.isCloudflareCdnEnabled = true;
    state.config.nodeSettings.publicNodeAddress = a.config.bucketName.slice(
      'externalvideos.'.length
    );
    state.config.getExternalVideosBaseUrl = () =>
      buildExternalVideosBaseUrl({
        ...state.config.nodeSettings,
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            ...a.config,
            s3ProviderClientConfig: { region: 'us-east-1', forcePathStyle: false },
          },
        },
      });
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    cloudflare.withConfigurationRollback = async (
      _email: unknown,
      _zone: unknown,
      _key: unknown,
      operation: () => Promise<void>
    ) => operation();
    cloudflare.resetCdn = vi.fn();
    cloudflare.purgeEntireCacheWithCredentials = vi.fn();
    Object.assign(state.config.nodeSettings, {
      cloudflareEmailAddress: 'email',
      cloudflareZoneId: 'zone',
      cloudflareGlobalApiKey: 'key',
    });
    state.config.nodeSettings.publicNodeProtocol = 'https';
    state.config.nodeSettings.publicNodePort = 443;
    cloudflare.restoreCdnSnapshot = vi.fn();
    cloudflare.retryPendingPurges = vi.fn();
    await writeCdnJournal(state.config.paths.nodeSettingsPath, {
      version: 1,
      current: null,
      originals: {
        [state.config.nodeSettings.cloudflareZoneId]: {
          credentials: {
            email: state.config.nodeSettings.cloudflareEmailAddress,
            zone: state.config.nodeSettings.cloudflareZoneId,
            key: state.config.nodeSettings.cloudflareGlobalApiKey,
          },
          before: { rules: null, settings: [] },
          applied: { rules: [], settings: [] },
        },
      },
    });
    const controller = new SettingsController(
      {
        clearCloudflareConfig: () => {
          state.config.nodeSettings.isCloudflareCdnEnabled = false;
        },
      } as never,
      videos,
      cloudflare,
      {} as never
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await controller.cloudflareClear({} as never, reply as never);
    expect(reply.status).toHaveBeenLastCalledWith(200);
    for (const name of ['720p', 'master'])
      expect(await a.text(prefix + 'static/manifests/manifest-' + name + '.m3u8')).not.toMatch(
        /^https?:\/\//m
      );
  });
  it('refreshes bucket, endpoint and credentials while older readers drain safely', async () => {
    await a.put('same', 'old bucket');
    await b.put('same', 'new bucket');
    const first = await storage.getFileStream('same');
    const second = await storage.getFileStream('same');
    state.config.nodeSettings.storageConfig = { storageMode: 's3provider', s3Config: b.config };
    expect((await storage.getFileMetadata('same'))?.size).toBe(10);
    for (const stream of [first, second]) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as Readable) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe('old bucket');
    }
    first.emit('close');
    second.emit('close');
    const proxy = await siloProxy(b.config.s3ProviderClientConfig.endpoint, () => {});
    try {
      state.config.nodeSettings.storageConfig = {
        storageMode: 's3provider',
        s3Config: {
          ...b.config,
          s3ProviderClientConfig: { ...b.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
        },
      };
      expect(await storage.fileExists('same')).toBe(true);
      state.config.nodeSettings.storageConfig.s3Config.s3ProviderClientConfig.credentials = {
        ...b.config.s3ProviderClientConfig.credentials,
        secretAccessKey: 'wrong',
      };
      expect(await storage.fileExists('same')).toBe(false);
      state.config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
      expect(storage.getStorageMode()).toBe('filesystem');
      state.config.nodeSettings.storageConfig = { storageMode: 's3provider', s3Config: b.config };
      expect(await storage.deleteDirectory('same')).toBe(1);
      expect(await a.text('same')).toBe('old bucket');
    } finally {
      await proxy.close();
    }
    storage.close();
    storage.close();
  });
  it('keeps metadata and comments until real origin deletion succeeds, then purges the deleted ID', async () => {
    await a.put('external/videos/video123/data', 'retained');
    const comments = { deleteByVideoId: vi.fn() };
    const videos = new VideosService(
      logger as never,
      repository,
      comments as never,
      storage,
      {} as never,
      cloudflare
    );
    state.config.nodeSettings.storageConfig = {
      storageMode: 's3provider',
      s3Config: {
        ...a.config,
        s3ProviderClientConfig: {
          ...a.config.s3ProviderClientConfig,
          credentials: { ...a.config.s3ProviderClientConfig.credentials, secretAccessKey: 'wrong' },
        },
      },
    };
    await expect(videos.deleteVideo('video123')).rejects.toThrow();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(comments.deleteByVideoId).not.toHaveBeenCalled();
    state.config.nodeSettings.storageConfig = { storageMode: 's3provider', s3Config: a.config };
    expect(await videos.deleteVideo('video123')).toBe(true);
    expect(cloudflare.purgeHomePage).toHaveBeenCalledWith(['video123']);
    expect(repository.delete.mock.invocationCallOrder[0]).toBeLessThan(
      cloudflare.purgeHomePage.mock.invocationCallOrder.at(-1)!
    );
  });
  it('invalidates viewer caches inside the settings/admission lock without rewriting playlists', async () => {
    await seed();
    video.is_streaming = false;
    await storage.finalizeS3Stream('video123', ['720p'], true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, async (req) => {
      if (req.method === 'PUT' && req.url?.includes('manifest-720p')) {
        entered = true;
        await gate;
      }
    });
    cloudflare.purgePrefixes.mockImplementationOnce(async () => {
      entered = true;
      await gate;
    });
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    const settings = {
      updateStorageConfig: (value: unknown) => {
        state.config.nodeSettings.storageConfig = value;
      },
    };
    const controller = new SettingsController(settings as never, videos, cloudflare, {} as never);
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    const operation = controller.storageConfigToggle(
      {
        body: {
          storageConfig: {
            storageMode: 's3provider',
            s3Config: {
              ...a.config,
              s3ProviderClientConfig: {
                ...a.config.s3ProviderClientConfig,
                endpoint: proxy.endpoint,
              },
            },
          },
        },
      } as never,
      reply as never
    );
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
      const competing = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
      await controller.storageConfigToggle(
        { body: { storageConfig: state.config.nodeSettings.storageConfig } } as never,
        competing as never
      );
      expect(competing.send).toHaveBeenCalledWith(
        expect.objectContaining({ isError: true, message: expect.stringContaining('in progress') })
      );
      await expect(videos.setPublishing('video123', true)).rejects.toThrow('in progress');
      await expect(
        streams.startNewStream({ existingVideoId: 'video123' } as never)
      ).rejects.toThrow('in progress');
      await expect(
        streams.startNewStream({
          title: 'x',
          description: '',
          tags: '',
          resolution: '720p',
          rtmpPort: 1935,
          networkAddress: 'localhost',
          isRecordingStreamLocally: false,
          isRecordingStreamRemotely: false,
        })
      ).rejects.toThrow('in progress');
      release();
      await operation;
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(await a.text(prefix + 'static/manifests/manifest-720p.m3u8')).not.toMatch(
        /^https?:\/\//m
      );
      expect(await a.text(prefix + 'static/manifests/manifest-master.m3u8')).toContain(
        'manifest-720p.m3u8'
      );
      expect(cloudflare.purgePrefixes).toHaveBeenCalledWith(
        [state.base + '/external/videos/'],
        true
      );
      expect(cloudflare.purgeHomePage).toHaveBeenCalledWith([], true, true);
      await expect(
        withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
      ).resolves.toBe(true);
    } finally {
      release();
      await operation;
      await proxy.close();
    }
  });
  it('finishes migration and releases the lock after the HTTP client disconnects', async () => {
    await seed();
    video.is_streaming = false;
    await storage.finalizeS3Stream('video123', ['720p'], true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, async (req) => {
      if (req.method === 'PUT') {
        entered = true;
        await gate;
      }
    });
    cloudflare.purgePrefixes.mockImplementationOnce(async () => {
      entered = true;
      await gate;
    });
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    const controller = new SettingsController(
      {
        updateStorageConfig: (value: unknown) => {
          state.config.nodeSettings.storageConfig = value;
        },
      } as never,
      videos,
      cloudflare,
      {} as never
    );
    const app = Fastify();
    app.post('/settings/storageConfig/toggle', controller.storageConfigToggle);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const abort = new AbortController();
    const response = fetch(app.listeningOrigin + '/settings/storageConfig/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            ...a.config,
            s3ProviderClientConfig: {
              ...a.config.s3ProviderClientConfig,
              endpoint: proxy.endpoint,
            },
          },
        },
      }),
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
      abort.abort();
      await response;
      release();
      // A disconnected FastifyReply can remain pending; it must not retain the settings lock.
      await vi.waitFor(async () =>
        expect(
          await withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
        ).toBe(true)
      );
      expect(await a.text(prefix + 'static/manifests/manifest-master.m3u8')).not.toMatch(
        /^https?:\/\//m
      );
    } finally {
      release();
      await proxy.close();
      await app.close();
    }
  });
  it('reports incomplete migration and allows reapplying saved settings to retry', async () => {
    await seed();
    video.is_streaming = false;
    await storage.finalizeS3Stream('video123', ['720p'], true);
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    const controller = new SettingsController(
      {
        updateStorageConfig: (value: unknown) => {
          state.config.nodeSettings.storageConfig = value;
        },
      } as never,
      videos,
      cloudflare,
      {} as never
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    cloudflare.purgePrefixes.mockRejectedValueOnce(new Error('purge failed'));
    const request = { body: { storageConfig: state.config.nodeSettings.storageConfig } } as never;
    await controller.storageConfigToggle(request, reply as never);
    expect(reply.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isError: true,
        message: expect.stringContaining('reapply these settings'),
      })
    );
    await controller.storageConfigToggle(request, reply as never);
    expect(reply.status).toHaveBeenLastCalledWith(200);
  });
  it('blocks origin changes while draining, but permits repairing credentials for the same origin', async () => {
    video.is_published = false;
    video.meta = JSON.stringify({ streamCleanupAt: Date.now() + 60_000 });
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    const controller = new SettingsController(
      { updateStorageConfig: vi.fn() } as never,
      videos,
      cloudflare,
      {} as never
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    await controller.storageConfigToggle(
      { body: { storageConfig: { storageMode: 'filesystem' } } } as never,
      reply as never
    );
    expect(reply.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: expect.stringContaining('finish draining') })
    );
    await controller.cloudflareClear({} as never, reply as never);
    expect(reply.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: expect.stringContaining('finish draining') })
    );
    await controller.storageConfigToggle(
      { body: { storageConfig: state.config.nodeSettings.storageConfig } } as never,
      reply as never
    );
    expect(reply.status).toHaveBeenLastCalledWith(200);
  });
  it.each(['-1', 'Infinity', '9'.repeat(310)])(
    'rejects invalid segment durations before publishing a replacement: %s',
    async (duration) => {
      const key = prefix + 'dynamic/manifests/manifest-720p.m3u8';
      const original = '#EXTM3U\n#EXTINF:' + duration + ',\nold.ts\n';
      await a.put(key, original);
      await expect(storage.finalizeS3Stream('video123', ['720p'], true)).rejects.toThrow(
        'Invalid playlist segment duration'
      );
      expect(await a.text(key)).toBe(original);
    }
  );
  it('uses the stopped origin snapshot after a configuration switch and rejects missing credentials', async () => {
    await a.put(prefix + 'old.ts', 'old');
    await b.put(prefix + 'old.ts', 'new');
    state.config.nodeSettings.storageConfig = { storageMode: 's3provider', s3Config: b.config };
    await storage.deleteStoppedStream(
      'video123',
      { storageMode: 's3provider', s3Config: a.config },
      root
    );
    await expect(a.text(prefix + 'old.ts')).rejects.toThrow();
    expect(await b.text(prefix + 'old.ts')).toBe('new');
    await expect(
      storage.deleteStoppedStream('video123', { storageMode: 's3provider' }, root)
    ).rejects.toThrow('Missing stopped-stream');
  });
  it('rejects finalization of a vanished stream and handles legacy empty outputs', async () => {
    repository.findById.mockResolvedValueOnce(undefined);
    await expect(streams.finalizeStreamManifests('video123')).rejects.toThrow('no longer exists');
    await seed(false);
    video.outputs = '{}';
    await expect(streams.finalizeStreamManifests('video123')).resolves.toBe(0);
  });
  it('can publish a legacy video without metadata', async () => {
    video = undefined;
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    await videos.setPublishing('legacy', true);
    expect(repository.update).toHaveBeenCalledWith(
      'legacy',
      expect.objectContaining({ is_publishing: true })
    );
  });
  it('clears publishing admission after a cancelled job', async () => {
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    await videos.setPublishing('video123', true);
    expect(video.is_publishing).toBe(true);
    await videos.setPublishing('video123', false);
    expect(video.is_publishing).toBe(false);
  });
  it.each(['missing', 'finished', 'new-deadline', 'legacy'])(
    'ignores obsolete cleanup jobs or finishes interrupted legacy stops: %s',
    async (variant) => {
      await seed(false);
      const meta = variant === 'legacy' ? {} : { streamGeneration: 'run-one' };
      video.meta = JSON.stringify(meta);
      const job = {
        videoId: 'video123',
        generation: variant === 'legacy' ? '123' : 'run-one',
        deadline: Date.now() - 1,
        storageConfig: state.config.nodeSettings.storageConfig,
        videosDirectory: state.config.paths.videosDirectoryPath,
      };
      if (variant === 'missing') video = undefined;
      if (variant === 'finished') video.is_streaming = false;
      if (variant === 'new-deadline')
        video.meta = JSON.stringify({ ...meta, streamCleanupAt: job.deadline + 60_000 });
      await (streams as any).cleanStoppedStream(job);
      if (variant === 'legacy')
        await expect(a.text(prefix + '720p/segments/run-one-0.ts')).rejects.toThrow();
      else expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
    }
  );
  it('logs and retains failed cleanup for a later retry', async () => {
    await seed(false);
    await streams.stopStream('video123');
    streams.close();
    state.config.nodeSettings.storageConfig.s3Config = {
      ...a.config,
      s3ProviderClientConfig: {
        ...a.config.s3ProviderClientConfig,
        credentials: { ...a.config.s3ProviderClientConfig.credentials, secretAccessKey: 'wrong' },
      },
    };
    const db = operationalForPath(state.config.paths.nodeSettingsPath);
    const row = (
      await db.query("SELECT key,value FROM node_recovery WHERE key LIKE 'cleanup:%'")
    )[0]!;
    await db.close();
    const job = JSON.parse(row.value as string);
    job.deadline = Date.now() - 1;
    video.meta = JSON.stringify({ ...JSON.parse(video.meta), streamCleanupAt: job.deadline });
    await writeRecovery(
      state.config.paths.nodeSettingsPath,
      row.key as string,
      JSON.stringify(job)
    );
    streams = new StreamsService(
      logger as never,
      repository,
      {} as never,
      {} as never,
      {} as never,
      cloudflare,
      storage
    );
    await streams.recoverStreamCleanup();
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        'Stopped stream cleanup will retry',
        expect.anything()
      )
    );
    const pending = operationalForPath(state.config.paths.nodeSettingsPath);
    try {
      expect(
        await pending.query("SELECT key FROM node_recovery WHERE key LIKE 'cleanup:%'")
      ).toHaveLength(1);
    } finally {
      await pending.close();
    }
    expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
  });
  it('honors recording finalization deadlines and retains the previous complete object after an aborted write', async () => {
    const key = prefix + 'dynamic/manifests/manifest-720p.m3u8';
    const original = '#EXTM3U\n#EXTINF:2,\nhttps://old.example/external/a.ts\n';
    await a.put(key, original);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const proxy = await siloProxy(a.config.s3ProviderClientConfig.endpoint, async (req) => {
      if (req.method === 'PUT') await gate;
    });
    try {
      state.config.nodeSettings.storageConfig = {
        storageMode: 's3provider',
        s3Config: {
          ...a.config,
          s3ProviderClientConfig: { ...a.config.s3ProviderClientConfig, endpoint: proxy.endpoint },
        },
      };
      await expect(
        withCloudflareDeadline(() => storage.finalizeS3Stream('video123', ['720p'], true), 50)
      ).rejects.toThrow();
      expect(await a.text(key)).toBe(original);
    } finally {
      release();
      await proxy.close();
    }
  });
  it.each([true, false])(
    'finalizes real S3 media and masters before marking stopped (recorded=%s)',
    async (recorded) => {
      await seed(recorded);
      const master = prefix + 'dynamic/manifests/manifest-master.m3u8';
      await a.put(master, (await a.text(master)).replace('#EXTM3U', '#EXTM3U\n#MOARTUBE-LIVE'));
      await streams.stopStream('video123', 90);
      expect(video.is_streaming).toBe(false);
      expect(video.is_published).toBe(recorded);
      expect(await a.text(prefix + 'dynamic/manifests/manifest-720p.m3u8')).toContain('ENDLIST');
      for (const name of ['720p', 'master'])
        expect(
          (
            await a.client.send(
              new HeadObjectCommand({
                Bucket: a.config.bucketName,
                Key: prefix + 'dynamic/manifests/manifest-' + name + '.m3u8',
              })
            )
          ).CacheControl
        ).toBe('no-store');
      if (recorded) {
        expect(await a.text(prefix + 'static/manifests/manifest-master.m3u8')).not.toContain(
          '#MOARTUBE-LIVE'
        );
        expect(await a.text(prefix + 'static/manifests/manifest-master.m3u8')).toContain(
          'manifest-720p.m3u8'
        );
      } else {
        await expect(a.text(prefix + 'static/manifests/manifest-master.m3u8')).rejects.toThrow();
        expect(JSON.parse(video.meta).streamCleanupAt).toBeGreaterThanOrEqual(Date.now() + 85_000);
        expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
        await expireJournal();
        await expect(a.text(prefix + '720p/segments/run-one-0.ts')).rejects.toThrow();
      }
    }
  );
  it('does not delete a resumed stream or republished video from an old cleanup journal', async () => {
    await seed(false);
    await streams.stopStream('video123');
    video.meta = JSON.stringify({ ...JSON.parse(video.meta), streamGeneration: 'run-two' });
    video.is_streaming = true;
    await expireJournal();
    expect(await a.text(prefix + '720p/segments/run-one-0.ts')).toBe('first stream bytes');
    video.is_streaming = false;
    await streams.stopStream('video123');
    const videos = new VideosService(
      logger as never,
      repository,
      {} as never,
      storage,
      {} as never,
      cloudflare
    );
    await expect(videos.setPublishing('video123', true)).rejects.toThrow('finish draining');
    await expireJournal();
    await videos.setPublishing('video123', true);
    expect(JSON.parse(video.meta).streamGeneration).not.toBe('run-two');
    await expect(a.text(prefix + '720p/segments/run-one-0.ts')).rejects.toThrow();
  });
  it('finalizes filesystem playlists and recovers their delayed cleanup after restart', async () => {
    state.config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
    video.is_stream_recorded_remotely = false;
    video.is_streaming = true;
    const folder = path.join(root, 'videos', 'video123', 'adaptive', 'm3u8');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'manifest-720p.m3u8'), '#EXTM3U\n#EXTINF:3,\nsegment.ts\n');
    await writeFile(
      path.join(folder, 'manifest-master.m3u8'),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttps://old/external/videos/video123/adaptive/m3u8/dynamic/manifests/manifest-720p.m3u8\n'
    );
    await streams.stopStream('video123');
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toContain('ENDLIST');
    expect(await readFile(path.join(folder, 'manifest-master.m3u8'), 'utf8')).not.toContain(
      'ENDLIST'
    );
    await expireJournal();
    await expect(readdir(folder)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
