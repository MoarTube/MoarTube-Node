import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
vi.mock('@/utils/public-file.js', () => ({
  servePublicFile: vi.fn(async (_request, reply) => reply),
}));
import { servePublicFile } from '@/utils/public-file.js';
const request = (params: object) => ({ params, headers: {} }) as FastifyRequest;
const reply = () =>
  ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }) as unknown as FastifyReply;

const config = vi.hoisted(() => ({
  paths: { videosDirectoryPath: '/videos' },
  getExternalVideosBaseUrl: vi.fn(() => 'https://example.com'),
}));
vi.mock('@config/index.js', () => ({ getConfig: () => config }));
import { ExternalVideosController } from '@controllers/external-videos.js';
describe('video delivery and bandwidth batching', () => {
  let controller: ExternalVideosController;
  const updateBandwidth = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    updateBandwidth.mockResolvedValue(undefined);
    vi.mocked(servePublicFile).mockImplementation(async (_req, res) => res);
    controller = new ExternalVideosController({ updateBandwidth } as any);
  });
  afterEach(() => vi.useRealTimers());
  const cases = [
    ['getThumbnail', { videoId: 'a' }, ['a', 'images', 'thumbnail.jpg'], 'image/jpeg'],
    ['getPreview', { videoId: 'a' }, ['a', 'images', 'preview.jpg'], 'image/jpeg'],
    ['getPoster', { videoId: 'a' }, ['a', 'images', 'poster.jpg'], 'image/jpeg'],
    [
      'getAdaptiveManifest',
      { videoId: 'a', format: 'm3u8', manifestName: 'master.m3u8', type: 'static' },
      ['a', 'adaptive', 'm3u8', 'master.m3u8'],
      'application/vnd.apple.mpegurl',
    ],
    [
      'getAdaptiveSegment',
      { videoId: 'a', format: 'm3u8', resolution: '720p', segmentName: '0.ts' },
      ['a', 'adaptive', 'm3u8', '720p', '0.ts'],
      'video/mp2t',
    ],
    [
      'getProgressive',
      { videoId: 'a', format: 'mp4', progressiveFilename: '720p.mp4' },
      ['a', 'progressive', 'mp4', '720p.mp4'],
      'video/mp4',
    ],
    [
      'getProgressive',
      { videoId: 'a', format: 'ogv', progressiveFilename: '720p.ogv' },
      ['a', 'progressive', 'ogv', '720p.ogv'],
      'video/ogg',
    ],
  ] as const;
  it.each(cases)('delegates %s safely', async (method, params, parts, type) => {
    const req = request(params),
      res = reply();
    await controller[method](req, res);
    expect(vi.mocked(servePublicFile).mock.calls[0]?.slice(0, 5)).toEqual([
      req,
      res,
      '/videos',
      parts,
      type,
    ]);
    const options = vi.mocked(servePublicFile).mock.calls[0]?.[5];
    if (options?.onBytes) options.onBytes(123);
    await controller.flushBandwidth();
  });
  it.each(cases)('returns 500 for unexpected %s failure', async (method, params) => {
    vi.mocked(servePublicFile).mockRejectedValue(new Error('disk'));
    const res = reply();
    await controller[method](request(params), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
  it('marks dynamic manifests as live', async () => {
    await controller.getAdaptiveManifest(
      request({ videoId: 'a', format: 'm3u8', manifestName: 'master.m3u8', type: 'dynamic' }),
      reply()
    );
    expect(vi.mocked(servePublicFile).mock.calls[0]?.[5]).toEqual({ live: true });
  });
  it('returns base URL', async () => {
    const res = reply();
    await controller.getBaseUrl(request({}), res);
    expect(res.send).toHaveBeenCalledWith({
      isError: false,
      externalVideosBaseUrl: 'https://example.com',
    });
  });
  it('handles base URL errors', async () => {
    config.getExternalVideosBaseUrl.mockImplementationOnce(() => {
      throw new Error('config');
    });
    const res = reply();
    await controller.getBaseUrl(request({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('keeps traffic for different videos separate and flushes during sustained traffic', async () => {
    for (const [id, bytes] of [
      ['a', 1000],
      ['b', 2000],
      ['a', 500],
    ] as const) {
      await controller.getProgressive(
        request({ videoId: id, format: 'mp4', progressiveFilename: 'x.mp4' }),
        reply()
      );
      vi.mocked(servePublicFile).mock.calls.at(-1)?.[5]?.onBytes?.(bytes);
      await vi.advanceTimersByTimeAsync(40);
    }
    expect(updateBandwidth).toHaveBeenCalledWith('a', 1500);
    expect(updateBandwidth).toHaveBeenCalledWith('b', 2000);
    expect(updateBandwidth).toHaveBeenCalledTimes(2);
  });
  it('ignores invalid byte counts and flushes remaining bytes at shutdown', async () => {
    await controller.getProgressive(
      request({ videoId: 'a', format: 'mp4', progressiveFilename: 'x.mp4' }),
      reply()
    );
    const count = vi.mocked(servePublicFile).mock.calls[0]?.[5]?.onBytes;
    for (const bytes of [0, -1, NaN, 1.2, Infinity]) count?.(bytes);
    await controller.flushBandwidth();
    expect(updateBandwidth).not.toHaveBeenCalled();
    count?.(50);
    count?.(100);
    await controller.flushBandwidth();
    expect(updateBandwidth).toHaveBeenCalledWith('a', 150);
    await vi.advanceTimersByTimeAsync(1000);
    expect(updateBandwidth).toHaveBeenCalledTimes(1);
  });
  it('contains database errors without unhandled timer rejections', async () => {
    updateBandwidth.mockRejectedValue(new Error('db'));
    await controller.getAdaptiveSegment(
      request({ videoId: 'a', format: 'm3u8', resolution: '720p', segmentName: '0.ts' }),
      reply()
    );
    vi.mocked(servePublicFile).mock.calls[0]?.[5]?.onBytes?.(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(updateBandwidth).toHaveBeenCalledOnce();
  });
  it('waits for an already-running database write at shutdown', async () => {
    let release!: () => void;
    updateBandwidth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    await controller.getProgressive(
      request({ videoId: 'a', format: 'mp4', progressiveFilename: 'x.mp4' }),
      reply()
    );
    vi.mocked(servePublicFile).mock.calls[0]?.[5]?.onBytes?.(100);
    await vi.advanceTimersByTimeAsync(100);
    let closed = false;
    const closing = controller.flushBandwidth().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await closing;
    expect(closed).toBe(true);
  });
});
