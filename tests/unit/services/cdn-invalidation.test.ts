import { operationalConfig } from '@/database/operational.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import { VideosService } from '@/services/videos.js';
import { VideoUploadService } from '@/services/video-upload.js';
import { purgeOutbox } from '@/utils/purge-outbox.js';
import { withoutRendition } from '@/utils/hls-rendition.js';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import view from '@fastify/view';
import ejs from 'ejs';
import { WatchEmbedController } from '@/controllers/watch-embed.js';
import errorHandler from '@/plugins/error-handler.js';
import { SettingsController } from '@/controllers/settings.js';

vi.mock('axios');
const state = vi.hoisted(() => ({ config: {} as any }));
vi.mock('@config/index.js', () => ({ getConfig: () => state.config }));
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const success = { data: { success: true } };
let root: string;
let post: ReturnType<typeof vi.fn>;
let cdn: CloudflareService;
let row: any;
let repository: any;
let videos: VideosService;
beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'moartube-invalidation-'));
  state.config = {
    paths: {
      nodeSettingsPath: path.join(root, 'settings.json'),
      videosDirectoryPath: path.join(root, 'videos'),
    },
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'email',
      cloudflareGlobalApiKey: 'key',
      storageConfig: { storageMode: 'filesystem' },
    },
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
  row = {
    video_id: 'video123',
    outputs: JSON.stringify({ m3u8: ['720p', '1080p'], mp4: [], webm: [], ogv: [] }),
    meta: '{}',
  };
  repository = {
    findById: vi.fn(async () => row),
    findAll: vi.fn(async () => [row]),
    update: vi.fn(async (_id, updates) => {
      Object.assign(row, updates);
      return row;
    }),
    incrementViews: vi.fn(async () => {
      row.views = 1;
    }),
    incrementViewsBy: vi.fn(async () => {
      row.views = 2;
    }),
  };
  post = vi.fn().mockResolvedValue(success);
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  cdn = new CloudflareService(logger as never, repository);
  vi.spyOn(cdn, 'getAdaptiveVideoUrls').mockResolvedValue([]);
  videos = new VideosService(
    logger as never,
    repository,
    {} as never,
    {} as never,
    {} as never,
    cdn
  );
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

describe('content invalidation regressions', () => {
  it.each([false, true])(
    'queues final invalidation for both distribution zones even when the previous purge fails (migration fails=%s)',
    async (failMigration) => {
      state.config.reloadNodeSettings = vi.fn();
      const service = new SettingsController(
        {} as never,
        { getAllVideosData: async () => [] } as never,
        cdn,
        {} as never
      );
      vi.mocked(axios.post).mockImplementation(async (url) => {
        expect(state.config.nodeSettings.cloudflareZoneId).toBe('new-zone');
        if (String(url).includes('/zones/zone/')) throw new Error('old zone unavailable');
        return success;
      });
      const operation = (service as any).changeDistributionSettings(async () => {
        state.config.nodeSettings = { ...state.config.nodeSettings, cloudflareZoneId: 'new-zone' };
        if (failMigration) throw new Error('migration failed');
      });
      await expect(operation).rejects.toThrow('incomplete');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/new-zone/purge_cache',
        { purge_everything: true },
        expect.any(Object)
      );
    }
  );
  it('clears primed filtered browse, unrelated recommendation pages and both embeds after a title edit', async () => {
    const cache = new Set([
      'node.example/home/videos?cursor=100&sortTerm=viewed&tagTerm=old',
      'node.example/watch?extra=1&v=other',
      'node.example/watch/embed/video/video123?autostart=1&extra=1',
      'node.example/watch/embed/chat/video123',
      'media.example/external/videos/other/progressive/mp4/720p.mp4',
    ]);
    post.mockImplementation(async (_url, body) => {
      expect(row.title).toBe('updated');
      for (const prefix of body.prefixes ?? [])
        for (const key of cache) if (key.startsWith(prefix)) cache.delete(key);
      return success;
    });
    await videos.updateVideo('video123', { title: 'updated' });
    expect([...cache]).toEqual(['media.example/external/videos/other/progressive/mp4/720p.mp4']);
  });

  it.each(['views', 'duration', 'outputs', 'publishing'] as const)(
    'invalidates dependent HTML after committed %s changes',
    async (change) => {
      if (change === 'views') await videos.incrementViews('video123');
      if (change === 'duration') await videos.setVideoLength('video123', 42, '00:42');
      if (change === 'outputs')
        await videos.markFormatResolutionPublished('video123', 'mp4', '720p');
      if (change === 'publishing') await videos.setPublishing('video123', false);
      expect(
        post.mock.calls.some(([, body]) => body.prefixes?.includes('node.example/watch'))
      ).toBe(true);
      expect(
        post.mock.calls.some(([, body]) => body.prefixes?.includes('node.example/videos'))
      ).toBe(true);
      const write = change === 'views' ? repository.incrementViews : repository.update;
      expect(write.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0]);
    }
  );

  it('persists a rejected prefix purge and a different service drains it without another mutation', async () => {
    post.mockRejectedValue({ response: { status: 403 } });
    await cdn.purgePublicPages();
    const journal = purgeOutbox(operationalConfig(state.config));
    expect((await journal.snapshot('zone')).length).toBe(3);
    await journal.close();
    post.mockResolvedValue(success);
    const replacement = new CloudflareService(logger as never, repository);
    await replacement.retryPendingPurges();
    const reopened = purgeOutbox(operationalConfig(state.config));
    expect(await reopened.snapshot('zone')).toEqual([]);
    await reopened.close();
  });

  it('does not acknowledge a newer worker generation with an older successful response', async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = cdn.purgePublicPages();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const other = new CloudflareService(logger as never, repository);
    post.mockRejectedValue({ response: { status: 403 } });
    await other.purgePublicPages();
    finish(success);
    await first;
    const journal = purgeOutbox(operationalConfig(state.config));
    expect((await journal.snapshot('zone')).length).toBe(3);
    await journal.close();
    post.mockResolvedValue(success);
    await cdn.retryPendingPurges();
  });

  it('shares Retry-After across service instances and resumes after the deadline', async () => {
    vi.useFakeTimers();
    post.mockRejectedValue({ response: { status: 429, headers: { 'retry-after': '60' } } });
    await cdn.purgePublicPages();
    const calls = post.mock.calls.length;
    const other = new CloudflareService(logger as never, repository);
    post.mockResolvedValue(success);
    await expect(other.retryPendingPurges()).rejects.toThrow('incomplete');
    expect(post.mock.calls.length).toBe(calls);
    vi.setSystemTime(Date.now() + 61_000);
    await other.retryPendingPurges();
    expect(post.mock.calls.length).toBeGreaterThan(calls);
  });

  it('journals unsuccessful whole-zone responses for later retry', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: false } });
    await expect(cdn.purgeEntireCacheWithCredentials('email', 'zone', 'key')).rejects.toThrow(
      'rejected'
    );
    await cdn.retryPendingPurges();
    expect(post).toHaveBeenCalledWith('/zones/zone/purge_cache', { purge_everything: true });
  });

  it('recovers a previous-zone purge after credentials are cleared from node settings', async () => {
    vi.mocked(axios.post)
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValue(success);
    await expect(
      cdn.purgeEntireCacheWithCredentials('previous-email', 'previous-zone', 'previous-key')
    ).rejects.toThrow();
    state.config.nodeSettings.isCloudflareCdnEnabled = false;
    state.config.nodeSettings.cloudflareGlobalApiKey = '';
    await new CloudflareService(logger as never, repository).retryPendingPurges();
    expect(axios.post).toHaveBeenLastCalledWith(
      'https://api.cloudflare.com/client/v4/zones/previous-zone/purge_cache',
      { purge_everything: true },
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Auth-Key': 'previous-key' }),
      })
    );
    const journal = purgeOutbox(operationalConfig(state.config));
    expect(await journal.pendingCredentials()).toEqual([]);
    await journal.close();
  });

  it.each(['video', 'chat'])(
    'gives %s embeds a bounded public lifetime and bypasses missing/authenticated/error responses',
    async (type) => {
      state.config.getExternalResourcesBaseUrl = () => 'https://node.example';
      state.config.nodeSettings.isLiveChatEnabled = true;
      const controller = new WatchEmbedController(
        videos,
        { getAllLinks: async () => [] } as never,
        { getWalletAddresses: async () => [] } as never
      );
      const app = Fastify();
      await writeFile(path.join(root, 'embed-video.ejs'), '<html>video</html>');
      await writeFile(path.join(root, 'embed-chat.ejs'), '<html>chat</html>');
      await app.register(view, { engine: { ejs }, root, production: false });
      await app.register(errorHandler);
      app.get('/:videoId', type === 'video' ? controller.getEmbedVideo : controller.getEmbedChat);
      try {
        expect((await app.inject('/video123')).headers['cache-control']).toContain('s-maxage=30');
        expect(
          (await app.inject({ url: '/video123', headers: { authorization: 'Bearer token' } }))
            .headers['cache-control']
        ).toBe('no-store');
        repository.findById.mockResolvedValueOnce(null);
        expect((await app.inject('/missing')).headers['cache-control']).toBe('no-store');
        await writeFile(
          path.join(root, `embed-${type}.ejs`),
          '<% throw new Error("render failure") %>'
        );
        const failed = await app.inject('/video123');
        expect(failed.statusCode).toBe(500);
        expect(failed.headers['cache-control']).toBe('no-store');
      } finally {
        await app.close();
      }
    }
  );

  it('rewrites a real filesystem master and deletes the withdrawn rendition before invalidation', async () => {
    const adaptive = path.join(root, 'videos', 'video123', 'adaptive', 'm3u8');
    await mkdir(path.join(adaptive, '720p'), { recursive: true });
    await writeFile(
      path.join(adaptive, 'manifest-master.m3u8'),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nmanifest-1080p.m3u8\n'
    );
    await writeFile(path.join(adaptive, 'manifest-720p.m3u8'), 'old');
    post.mockImplementation(async () => {
      expect(await readFile(path.join(adaptive, 'manifest-master.m3u8'), 'utf8')).not.toContain(
        '720p'
      );
      await expect(readFile(path.join(adaptive, 'manifest-720p.m3u8'))).rejects.toThrow();
      return success;
    });
    await videos.unpublishFormatResolution('video123', 'm3u8', '720p');
    expect(JSON.parse(row.outputs).m3u8).toEqual(['1080p']);
  });

  it('purges both public aliases after atomically replacing a live playlist', async () => {
    const service = new VideoUploadService({} as never, cdn, {} as never, logger as never);
    await service.saveUploadedFile(
      {
        filename: 'manifest-720p.m3u8',
        file: Readable.from(['#EXTM3U\n#EXTINF:1,\n1.ts\n']),
      } as never,
      path.join(root, 'videos', 'video123', 'adaptive', 'm3u8')
    );
    expect(
      post.mock.calls.some(([, body]) =>
        body.prefixes?.includes(
          'media.example/external/videos/video123/adaptive/m3u8/dynamic/manifests/manifest-720p.m3u8'
        )
      )
    ).toBe(true);
  });

  it('removes only the matching HLS variant descriptor, including query-bearing URIs', () => {
    const transform = withoutRendition('720p');
    const result = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1',
      'https://media.example/manifest-720p.m3u8?x=1',
      '#EXT-X-STREAM-INF:BANDWIDTH=2',
      'manifest-1080p.m3u8',
    ]
      .map(transform)
      .join('\n');
    expect(result).not.toContain('BANDWIDTH=1');
    expect(result).toContain('BANDWIDTH=2\nmanifest-1080p.m3u8');
  });

  it('retains comments on surviving HLS variants and removes the withdrawn iframe entry', () => {
    const transform = withoutRendition('720p');
    const result = [
      '#EXTM3U',
      '#EXT-X-I-FRAME-STREAM-INF:URI="manifest-720p.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2',
      '# a comment',
      '',
      'manifest-1080p.m3u8',
    ]
      .map(transform)
      .join('\n');
    expect(result).not.toContain('720p');
    expect(result).toContain('#EXT-X-STREAM-INF:BANDWIDTH=2\n# a comment\n\nmanifest-1080p.m3u8');
  });

  it.each([
    ['adaptive/m3u8/720p', 'segment-1.ts', '/adaptive/m3u8/720p/segments/segment-1.ts'],
    ['progressive/mp4', '720p.mp4', '/progressive/mp4/720p.mp4'],
    ['staging', 'private.txt', undefined],
  ])('invalidates the actual public upload path for %s/%s', async (folder, filename, suffix) => {
    const upload = new VideoUploadService({} as never, cdn, {} as never, logger as never);
    await upload.saveUploadedFile(
      { filename, file: Readable.from(['complete bytes']) } as never,
      path.join(root, 'videos', 'video123', folder)
    );
    if (suffix)
      expect(post.mock.calls.flatMap(([, body]) => body.prefixes ?? [])).toContain(
        'media.example/external/videos/video123' + suffix
      );
    else expect(post).not.toHaveBeenCalled();
  });

  it('does not send page purges while CDN is disabled', async () => {
    state.config.nodeSettings.isCloudflareCdnEnabled = false;
    await cdn.purgePublicPages();
    expect(post).not.toHaveBeenCalled();
  });
  it('keeps a disabled unconfigured service inert without creating a journal', async () => {
    state.config.nodeSettings.isCloudflareCdnEnabled = false;
    delete state.config.paths;
    await cdn.retryPendingPurges();
    expect(post).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('does not send a segment purge if CDN is disabled while segment discovery is in flight', async () => {
    vi.mocked(cdn.getAdaptiveVideoUrls).mockImplementationOnce(async () => {
      state.config.nodeSettings.isCloudflareCdnEnabled = false;
      cdn.isEnabled();
      return ['https://media.example/external/videos/video123/adaptive/m3u8/720p/segments/1.ts'];
    });
    await cdn.purgeAdaptiveVideos('video123');
    expect(post.mock.calls.flatMap(([, body]) => body.files ?? [])).not.toContain(
      'https://media.example/external/videos/video123/adaptive/m3u8/720p/segments/1.ts'
    );
  });

  it('coalesces overlapping retry ticks while the first response is outstanding', async () => {
    post.mockRejectedValue({ response: { status: 403 } });
    await cdn.purgePublicPages();
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const running = cdn.retryPendingPurges();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const calls = post.mock.calls.length;
    await cdn.retryPendingPurges();
    expect(post.mock.calls.length).toBe(calls);
    finish(success);
    await running;
  });

  it.each(['60', new Date(Date.now() + 120_000).toUTCString()])(
    'defers previous-zone recovery using Retry-After %s',
    async (header) => {
      vi.mocked(axios.post).mockRejectedValue({
        response: { status: 429, headers: { 'retry-after': header } },
      });
      await expect(
        cdn.purgeEntireCacheWithCredentials('old-email', 'old-zone', 'old-key')
      ).rejects.toThrow();
      const calls = vi.mocked(axios.post).mock.calls.length;
      state.config.nodeSettings.isCloudflareCdnEnabled = false;
      await expect(cdn.retryPendingPurges()).rejects.toThrow('incomplete');
      expect(axios.post).toHaveBeenCalledTimes(calls);
    }
  );

  it('retains old and current zone failures independently', async () => {
    vi.mocked(axios.post).mockRejectedValue({ response: { status: 403 } });
    await expect(
      cdn.purgeEntireCacheWithCredentials('old-email', 'old-zone', 'old-key')
    ).rejects.toThrow();
    post.mockRejectedValue({ response: { status: 403 } });
    await cdn.purgePublicPages();
    await expect(cdn.retryPendingPurges()).rejects.toThrow('incomplete');
    const journal = purgeOutbox(operationalConfig(state.config));
    expect((await journal.pendingCredentials()).map(({ zone }) => zone).sort()).toEqual([
      'old-zone',
      'zone',
    ]);
    await journal.close();
  });
});
