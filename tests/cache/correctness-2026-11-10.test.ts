// Regression cases reproduced during the 2026-11-10 cache correctness audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import { StreamsService } from '@/services/streams.js';
import { VideosService } from '@/services/videos.js';
import { SettingsService } from '@/services/settings.js';
import { SettingsController } from '@/controllers/settings.js';
import { VideosController } from '@/controllers/videos.js';
import { VideoUploadService } from '@/services/video-upload.js';
import { streamsRoutes } from '@/routes/streams.js';
import { filenameSchema } from '@/validators/schemas/common.js';
import { hlsSegmentNameSchema } from '@/validators/schemas/streams.js';
import { installCachePolicy } from '@/plugins/cache-policy.js';
import { servePublicFile } from '@/utils/public-file.js';
import { operationalConfig } from '@/database/operational.js';
import { purgeOutbox } from '@/utils/purge-outbox.js';

vi.mock('axios');
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const state = vi.hoisted(() => ({ config: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => state.config }));
vi.mock('@/utils/distribution-admission.js', () => ({
  withJobAdmission: (work: () => Promise<unknown>) => work(),
  withMediaWrite: (work: () => Promise<unknown>) => work(),
}));
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const videoId = 'abcdefghijk';
const mediaBase = 'https://media.example/external/videos/' + videoId;
let root: string;
let post: ReturnType<typeof vi.fn>;
let cdn: CloudflareService;
let row: any;
let repository: any;
let comments: any;
let streams: StreamsService;
beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'moartube-cache-reinspection-'));
  state.config = {
    paths: {
      nodeSettingsPath: path.join(root, 'settings.json'),
      dataDirectoryPath: root,
      videosDirectoryPath: path.join(root, 'videos'),
      publicDirectoryPath: path.join(root, 'public'),
      imagesDirectoryPath: path.join(root, 'images'),
    },
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
      storageConfig: { storageMode: 'filesystem' },
    },
    reloadNodeSettings: vi.fn(),
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
    getExternalResourcesBaseUrl: () => 'https://node.example',
  };
  post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  cdn = new CloudflareService(logger as never);
  row = { video_id: videoId, meta: '{}', outputs: '{"m3u8":[],"mp4":["720p"],"webm":[],"ogv":[]}' };
  repository = {
    findById: vi.fn(async () => row),
    update: vi.fn(async (_id, updates) => Object.assign(row, updates)),
    delete: vi.fn().mockResolvedValue(true),
  };
  comments = { deleteByVideoId: vi.fn().mockResolvedValue(1) };
  streams = new StreamsService(
    logger as never,
    repository,
    { deleteByVideoId: vi.fn() } as never,
    comments,
    { broadcastToNodes: vi.fn() } as never,
    cdn,
    {} as never
  );
});

it.each([
  '../segment-720p-0.ts',
  'segment-720p-11111111/1111-4111-8111-111111111111-0.ts',
  'segment-720p-not-a-generation-0.ts',
  'segment-123p-0.ts',
  'segment-720p-0.ts.extra',
])('still rejects unsafe or unsupported segment names: %s', (name) => {
  expect(hlsSegmentNameSchema.safeParse(name).success).toBe(false);
});

const purgeOperations: Array<[string, () => Promise<void>]> = [
  ['files', () => cdn.purgeFiles([mediaBase + '/progressive/mp4/720p.mp4'])],
  ['prefixes', () => cdn.purgePrefixes([mediaBase + '/'])],
  ['comments', () => cdn.purgeComments(videoId)],
  ['public pages', () => cdn.purgePublicPages()],
  ['watch pages', () => cdn.purgeWatchPages([videoId])],
  ['embed pages', () => cdn.purgeEmbedVideoPages([videoId])],
  ['homepage', () => cdn.purgeHomePage([videoId])],
  ['node images', () => cdn.purgeNodeImages()],
  ['adaptive media', () => cdn.purgeAdaptiveVideos(videoId)],
  ['progressive media', () => cdn.purgeProgressiveVideos(videoId)],
  ['preview', () => cdn.purgeVideoPreviewImages([videoId])],
  ['poster', () => cdn.purgeVideoPosterImages([videoId])],
  ['thumbnail', () => cdn.purgeVideoThumbnailImages([videoId])],
  ['entire cache', () => cdn.purgeEntireCache()],
];
it.each(purgeOperations)(
  'reports unpersisted %s invalidation instead of swallowing it',
  async (_name, purge) => {
    const cause = new Error('SQLITE_FULL');
    vi.spyOn(cdn as any, 'outbox').mockReturnValue({
      enqueue: vi.fn().mockRejectedValue(cause),
      close: vi.fn(),
    });
    await expect(purge()).rejects.toMatchObject({
      message: 'Cache invalidation could not be durably queued',
      cause,
    });
    expect(post).not.toHaveBeenCalled();
  }
);

it('reports failure to open the purge journal', async () => {
  vi.spyOn(cdn as any, 'outbox').mockImplementation(() => {
    throw new Error('Database unavailable');
  });
  await expect(cdn.purgeFiles([mediaBase + '/file.ts'])).rejects.toThrow('durably queued');
  expect(post).not.toHaveBeenCalled();
});

it.each(['update', 'meta', 'delete'] as const)(
  'does not mask purge persistence failure during a video %s',
  async (operation) => {
    vi.spyOn(cdn as any, 'outbox').mockReturnValue({
      enqueue: vi.fn().mockRejectedValue(new Error('SQLITE_FULL')),
      close: vi.fn(),
    });
    const videos = new VideosService(
      logger as never,
      repository,
      comments,
      {} as never,
      {} as never,
      cdn
    );
    const work =
      operation === 'update'
        ? videos.updateVideo(videoId, { title: 'Updated' })
        : operation === 'meta'
          ? videos.updateVideoMeta(videoId, {})
          : videos.deleteVideo(videoId);
    await expect(work).rejects.toThrow('durably queued');
    expect(post).not.toHaveBeenCalled();
  }
);

it.each(['bulletin', 'links'] as const)(
  'reports purge persistence failure from the %s HTTP endpoint',
  async (kind) => {
    state.config.updateNodeSettings = vi.fn();
    vi.spyOn(cdn as any, 'outbox').mockReturnValue({
      enqueue: vi.fn().mockRejectedValue(new Error('SQLITE_FULL')),
      close: vi.fn(),
    });
    const settings = new SettingsService(
      logger as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cdn
    );
    const controller = new SettingsController(settings, {} as never, cdn, {} as never);
    const app = Fastify();
    app.post(
      '/settings',
      kind === 'bulletin' ? controller.personalizeNodeBulletin : controller.personalizeNodeLinks
    );
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/settings',
        payload:
          kind === 'bulletin'
            ? { nodeBulletin: ['Hello'] }
            : { nodeLinks: [{ url: 'https://example.test', description: 'Link' }] },
      });
      expect(response.statusCode).toBe(500);
      expect(state.config.updateNodeSettings).toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
);

it('invalidates a committed banner even when a later multipart part exceeds the limit', async () => {
  const images = state.config.paths.imagesDirectoryPath;
  await mkdir(images, { recursive: true });
  await writeFile(path.join(images, 'banner.png'), 'OLD BANNER');
  const controller = new SettingsController({} as never, {} as never, cdn, {} as never);
  const app = Fastify();
  await app.register(multipart);
  app.post('/settings/banner', controller.uploadBanner);
  const boundary = 'moartube-audit-boundary';
  const image =
    '--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="bannerFile"; filename="banner.png"\r\nContent-Type: image/png\r\n\r\nNEW BANNER\r\n';
  const fields = Array.from(
    { length: 4 },
    (_, index) =>
      '--' +
      boundary +
      '\r\nContent-Disposition: form-data; name="field' +
      index +
      '"\r\n\r\nvalue\r\n'
  ).join('');
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/settings/banner',
      headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: image + fields + '--' + boundary + '--\r\n',
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(await readFile(path.join(images, 'banner.png'), 'utf8')).toBe('NEW BANNER');
    expect(post.mock.calls[0]?.[1].prefixes).toContain(
      'node.example/external/resources/images/banner.png'
    );
    const control = await app.inject({
      method: 'POST',
      url: '/settings/banner',
      headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: image + '--' + boundary + '--\r\n',
    });
    expect(control.statusCode).toBe(200);
    expect(post).toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it.each(['thumbnail', 'preview', 'poster'] as const)(
  'invalidates a committed %s even when a later image is rejected',
  async (imageType) => {
    const directory = path.join(root, 'videos', videoId, 'images');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, imageType + '.jpg'), 'OLD IMAGE');
    const upload = new VideoUploadService({} as never, cdn, {} as never, logger as never);
    const controller = new VideosController(
      { getVideo: async () => row } as never,
      {} as never,
      upload,
      cdn,
      {} as never
    );
    const app = Fastify();
    await app.register(multipart);
    const handlers = {
      thumbnail: controller.uploadThumbnail,
      preview: controller.uploadPreview,
      poster: controller.uploadPoster,
    };
    app.post('/videos/:videoId/image', handlers[imageType]);
    const boundary = 'moartube-audit-boundary';
    const first =
      '--' +
      boundary +
      '\r\nContent-Disposition: form-data; name="' +
      imageType +
      'File"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\nNEW IMAGE\r\n';
    const second =
      '--' +
      boundary +
      '\r\nContent-Disposition: form-data; name="' +
      imageType +
      'File"; filename="image.png"\r\nContent-Type: image/png\r\n\r\nINVALID SECOND IMAGE\r\n';
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/videos/' + videoId + '/image',
        headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload: first + second + '--' + boundary + '--\r\n',
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(await readFile(path.join(directory, imageType + '.jpg'), 'utf8')).toBe('NEW IMAGE');
      expect(post.mock.calls[0]?.[1].prefixes).toContain(
        'media.example/external/videos/' + videoId + '/images/' + imageType + '.jpg'
      );
      const control = await app.inject({
        method: 'POST',
        url: '/videos/' + videoId + '/image',
        headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload: first + '--' + boundary + '--\r\n',
      });
      expect(control.statusCode).toBe(200);
      expect(post).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
);
afterEach(async () => {
  vi.restoreAllMocks();
  streams.close();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('moartube-cache-reinspection-')
  ) {
    throw new Error('Unexpected fixture path');
  }
  await rm(root, { recursive: true, force: true });
});

it.each(['persistence', 'unspecified'] as const)(
  'reports %s image invalidation failure through the upload HTTP endpoint',
  async (failure) => {
    vi.spyOn(cdn as any, 'outbox').mockReturnValue({
      enqueue: vi.fn().mockRejectedValue(new Error('SQLITE_FULL')),
      close: vi.fn(),
    });
    const upload = new VideoUploadService({} as never, cdn, {} as never, logger as never);
    if (failure === 'unspecified') {
      vi.spyOn(upload, 'handleImageUploadComplete').mockResolvedValue({ success: false, videoId });
    }
    const controller = new VideosController(
      { getVideo: async () => row } as never,
      {} as never,
      upload,
      cdn,
      {} as never
    );
    const app = Fastify();
    await app.register(multipart);
    app.post('/videos/:videoId/image', controller.uploadThumbnail);
    const boundary = 'moartube-image-failure';
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/videos/' + videoId + '/image',
        headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload:
          '--' +
          boundary +
          '\r\nContent-Disposition: form-data; name="thumbnailFile"; filename="thumbnail.jpg"\r\nContent-Type: image/jpeg\r\n\r\nNEW IMAGE\r\n--' +
          boundary +
          '--\r\n',
      });
      expect(response.statusCode).toBe(500);
      expect(
        await readFile(path.join(root, 'videos', videoId, 'images/thumbnail.jpg'), 'utf8')
      ).toBe('NEW IMAGE');
      expect(post).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
);

it('purges every replaced media namespace and historical comments when restreaming', async () => {
  const progressive = path.join(root, 'videos', videoId, 'progressive/mp4/720p.mp4');
  await mkdir(path.dirname(progressive), { recursive: true });
  await writeFile(progressive, 'OLD MEDIA');
  const oldMedia = mediaBase + '/progressive/mp4/720p.mp4';
  const oldComments = 'https://node.example/videos/' + videoId + '/comments?epoch=old&revision=1';
  const cache = new Map([
    [oldMedia, 'OLD MEDIA'],
    [oldComments, 'DELETED COMMENT'],
  ]);
  // Model the provider's documented URL-prefix and exact-file purge behavior.
  post.mockImplementation(async (_route, body) => {
    for (const url of cache.keys()) {
      const key = new URL(url);
      if (
        (body.prefixes ?? []).some((prefix: string) =>
          (key.host + key.pathname).startsWith(prefix)
        ) ||
        (body.files ?? []).some((file: any) => (typeof file === 'string' ? file : file.url) === url)
      ) {
        cache.delete(url);
      }
    }
    return { data: { success: true } };
  });
  await expect(
    streams.startNewStream({
      existingVideoId: videoId,
      title: 'Again',
      description: '',
      tags: '',
      rtmpPort: 1935,
      networkAddress: '127.0.0.1',
      resolution: '720p',
      isRecordingStreamRemotely: false,
      isRecordingStreamLocally: false,
    })
  ).resolves.toEqual({ videoId });
  await expect(readFile(progressive)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(comments.deleteByVideoId).toHaveBeenCalledWith(videoId);
  expect(cache.size).toBe(0);
  expect(
    post.mock.calls.some(([, body]) =>
      body.prefixes?.includes('media.example/external/videos/' + videoId + '/progressive/')
    )
  ).toBe(true);
});

it('deletes and purges generation-qualified live segments emitted by the current Client', async () => {
  const name = 'segment-720p-11111111-1111-4111-8111-111111111111-0.ts';
  expect(filenameSchema.safeParse(name).success).toBe(true); // It is a valid public/upload filename.
  const directory = path.join(root, 'videos', videoId, 'adaptive/m3u8/720p');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), 'OLD SEGMENT');
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('authenticate', async () => {});
  app.decorate('optionalAuthenticate', async () => {});
  await app.register(
    async (scoped) =>
      streamsRoutes(
        scoped as never,
        { resolve: (key: string) => (key === 'streamsService' ? streams : {}) } as never
      ),
    { prefix: '/streams' }
  );
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/streams/' + videoId + '/adaptive/m3u8/720p/segments/remove',
      payload: { segmentName: name },
    });
    expect(response.statusCode).toBe(200);
    await expect(readFile(path.join(directory, name))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(post.mock.calls[0]?.[1].files).toContain(
      mediaBase + '/adaptive/m3u8/720p/segments/' + name
    );
    const control = await app.inject({
      method: 'POST',
      url: '/streams/' + videoId + '/adaptive/m3u8/720p/segments/remove',
      payload: { segmentName: 'segment-720p-0.ts' },
    });
    expect(control.statusCode).toBe(200);
    expect(post).toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it('reports purge persistence failure after a replacement and allows the mutation to be retried', async () => {
  const directory = path.join(root, 'videos', videoId, 'progressive/mp4');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '720p.mp4'), 'OLD');
  const journal = { enqueue: vi.fn().mockRejectedValue(new Error('SQLITE_FULL')), close: vi.fn() };
  const persistence = vi.spyOn(cdn as any, 'outbox').mockReturnValue(journal);
  const upload = new VideoUploadService({} as never, cdn, {} as never, logger as never);
  await expect(
    upload.saveUploadedFile(
      { filename: '720p.mp4', file: Readable.from(['NEW']) } as never,
      directory
    )
  ).rejects.toThrow('durably queued');
  expect(await readFile(path.join(directory, '720p.mp4'), 'utf8')).toBe('NEW');
  expect(journal.enqueue).toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  expect((cdn as any).pendingPurges.size).toBe(0);
  const actual = purgeOutbox(operationalConfig(state.config));
  try {
    expect(await actual.snapshot('zone')).toEqual([]);
  } finally {
    await actual.close();
  }
  await expect(cdn.purgeFiles([mediaBase + '/progressive/mp4/720p.mp4'], true)).rejects.toThrow(
    'durably queued'
  );
  persistence.mockRestore();
  await expect(
    upload.saveUploadedFile(
      { filename: '720p.mp4', file: Readable.from(['NEW']) } as never,
      directory
    )
  ).resolves.toBeUndefined();
  expect(post).toHaveBeenCalled();
});

it.each([{}, '<html>upstream failure</html>', null, { success: 'false' }])(
  'retains and retries purges without affirmative provider success: %j',
  async (body) => {
    post.mockResolvedValue({ data: body });
    await expect(cdn.purgeFiles([mediaBase + '/progressive/mp4/720p.mp4'], true)).rejects.toThrow(
      'incomplete'
    );
    expect(post).toHaveBeenCalledTimes(3);
    const actual = purgeOutbox(operationalConfig(state.config));
    try {
      expect(await actual.snapshot('zone')).not.toEqual([]);
    } finally {
      await actual.close();
    }
    post.mockResolvedValue({ data: { success: true } });
    await cdn.retryPendingPurges();
    const recovered = purgeOutbox(operationalConfig(state.config));
    try {
      expect(await recovered.snapshot('zone')).toEqual([]);
    } finally {
      await recovered.close();
    }
  }
);

it('serves valid local media uncached when Origin is sent without a public network address', async () => {
  state.config.nodeSettings.isCloudflareCdnEnabled = false;
  state.config.getNodeBaseUrl = () => '';
  const directory = path.join(root, 'videos', videoId, 'adaptive/m3u8/720p');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'segment-720p-0.ts'), 'VALID MEDIA');
  const app = Fastify();
  installCachePolicy(app);
  app.get(
    '/external/videos/' + videoId + '/adaptive/m3u8/720p/segments/segment-720p-0.ts',
    (request, reply) =>
      servePublicFile(
        request,
        reply,
        state.config.paths.videosDirectoryPath,
        [videoId, 'adaptive', 'm3u8', '720p', 'segment-720p-0.ts'],
        'video/mp2t'
      )
  );
  try {
    const url = '/external/videos/' + videoId + '/adaptive/m3u8/720p/segments/segment-720p-0.ts';
    expect((await app.inject(url)).statusCode).toBe(200);
    const response = await app.inject({ url, headers: { origin: 'http://127.0.0.1:9090' } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('VALID MEDIA');
    expect(response.headers['cache-control']).toBe('no-store');
  } finally {
    await app.close();
  }
});
