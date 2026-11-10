import fs from 'node:fs';
import * as promises from 'node:fs/promises';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});
import { Readable } from 'node:stream';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicFilePath, isPathSegment } from '@/utils/public-path.js';
import { servePublicFile, byteRange } from '@/utils/public-file.js';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { externalResourcesRoutes } from '@/routes/external-resources.js';
import { externalVideosRoutes } from '@/routes/external-videos.js';
import type { Container } from '@/core/container.js';
const config = vi.hoisted(() => ({
  nodeSettings: {
    publicNodeProtocol: 'https',
    publicNodeAddress: 'example.com',
    publicNodePort: 443,
  },
  getNodeBaseUrl: () => 'https://example.com',
  getExternalVideosBaseUrl: () => 'https://example.com',
  paths: { publicDirectoryPath: '', imagesDirectoryPath: '', videosDirectoryPath: '' },
}));
vi.mock('@config/index.js', () => ({ getConfig: () => config }));
const video = 'aaaaaaaaaaa';
const media = `/external/videos/${video}`;
describe('public file HTTP boundaries and delivery', () => {
  let root: string, app: FastifyInstance;
  const bandwidth = vi.fn().mockResolvedValue(undefined);
  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'moartube-public-files-'));
    config.paths = {
      publicDirectoryPath: path.join(root, 'public'),
      imagesDirectoryPath: path.join(root, 'images'),
      videosDirectoryPath: path.join(root, 'videos'),
    };
    for (const folder of [
      'public/javascript',
      'public/css',
      'public/fonts',
      'public/images',
      'images',
      `videos/${video}/progressive/mp4`,
      `videos/${video}/adaptive/m3u8/720p`,
    ])
      mkdirSync(path.join(root, folder), { recursive: true });
    writeFileSync(path.join(root, 'private.txt'), 'PRIVATE AUDIT MARKER');
    writeFileSync(path.join(root, 'public/javascript/app.js'), 'window.example = 1;'.repeat(300));
    writeFileSync(
      path.join(root, `videos/${video}/progressive/mp4/720p.mp4`),
      Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))
    );
    writeFileSync(
      path.join(root, `videos/${video}/adaptive/m3u8/manifest-master.m3u8`),
      '#EXTM3U\n'
    );
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('optionalAuthenticate', async () => {});
    app.decorate('authenticate', async () => {});
    await app.register(async (scoped) => externalResourcesRoutes(scoped), {
      prefix: '/external/resources',
    });
    await app.register(
      async (scoped) =>
        externalVideosRoutes(scoped, {
          resolve: () => ({ updateBandwidth: bandwidth }),
        } as unknown as Container),
      { prefix: '/external/videos' }
    );
  });
  afterEach(async () => {
    await app.close();
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith('moartube-public-files-')
    )
      throw new Error('Unexpected fixture');
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });
  it.each([
    '/external/resources/javascript/..%2f..%2fprivate.txt',
    '/external/resources/css/..%5c..%5cprivate.txt',
    `${media}/progressive/mp4/..%2f..%2f..%2f..%2fprivate.txt`,
    `${media}/adaptive/m3u8/static/manifests/..%2f..%2f..%2f..%2fprivate.txt`,
  ])('rejects traversal %s', async (url) => {
    const response = await app.inject(url);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain('PRIVATE AUDIT MARKER');
  });
  it('revalidates static assets without retransmitting unchanged bytes', async () => {
    const first = await app.inject('/external/resources/javascript/app.js');
    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toBeTruthy();
    expect(first.headers['last-modified']).toBeTruthy();
    expect(first.headers['cache-control']).toContain('max-age=0');
    const next = await app.inject({
      url: '/external/resources/javascript/app.js',
      headers: { 'if-none-match': String(first.headers.etag) },
    });
    expect(next.statusCode).toBe(304);
    expect(next.body).toBe('');
  });
  it('compresses text while leaving video byte ranges unchanged', async () => {
    const response = await app.inject({
      url: '/external/resources/javascript/app.js',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.rawPayload.length).toBeLessThan(500);
  });
  it('keeps existing video URLs fresh at the CDN for a year while browsers revalidate', async () => {
    writeFileSync(
      path.join(root, `videos/${video}/adaptive/m3u8/720p/segment-1.ts`),
      'segment bytes'
    );
    writeFileSync(
      path.join(root, `videos/${video}/adaptive/m3u8/manifest-720p.m3u8`),
      '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment-1.ts\n#EXT-X-ENDLIST\n'
    );
    for (const suffix of [
      '/progressive/mp4/720p.mp4',
      '/adaptive/m3u8/720p/segments/segment-1.ts',
      '/adaptive/m3u8/static/manifests/manifest-720p.m3u8',
    ]) {
      const url = media + suffix;
      const first = await app.inject(url);
      expect(first.statusCode).toBe(200);
      expect(first.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=31536000, must-revalidate'
      );
      const unchanged = await app.inject({
        url,
        headers: { 'if-none-match': String(first.headers.etag) },
      });
      expect(unchanged.statusCode).toBe(304);
      expect(unchanged.headers['cache-control']).toBe(first.headers['cache-control']);
    }
    const partial = await app.inject({
      url: media + '/progressive/mp4/720p.mp4',
      headers: { range: 'bytes=0-15' },
    });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=31536000, must-revalidate'
    );
  });
  it.each([
    ['bytes=0-15', 0, 15, 16],
    ['bytes=-16', 984, 999, 16],
    ['bytes=990-', 990, 999, 10],
    ['bytes=0-9999', 0, 999, 1000],
  ] as const)('serves valid range %s', async (range, start, end, length) => {
    const response = await app.inject({
      url: `${media}/progressive/mp4/720p.mp4`,
      headers: { range },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/1000`);
    expect(response.rawPayload).toHaveLength(length);
    expect(response.rawPayload[0]).toBe(start % 256);
  });
  it.each(['bytes=1000-', 'bytes=20-10', 'bytes=abc-def', 'bytes=-0'])(
    'handles unsatisfiable or invalid range %s',
    async (range) => {
      const response = await app.inject({
        url: `${media}/progressive/mp4/720p.mp4`,
        headers: { range },
      });
      expect(response.statusCode).toBe(416);
      expect(response.headers['content-range']).toBe('bytes */1000');
    }
  );
  it('ignores unsupported multipart ranges safely', async () => {
    const response = await app.inject({
      url: `${media}/progressive/mp4/720p.mp4`,
      headers: { range: 'bytes=0-1,4-5' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toHaveLength(1000);
  });
  it('does not cache live manifests', async () => {
    const response = await app.inject(
      `${media}/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8`
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects unsafe path segments, directories, missing files, and symlink escapes', async () => {
    for (const value of ['', '.', '..', 'x/y', 'x\\y', 'x:y', 'x\0', 'x.', ' x']) {
      expect(isPathSegment(value)).toBe(false);
      await expect(publicFilePath(root, [value])).rejects.toThrow();
    }
    symlinkSync(root, path.join(root, 'public/javascript/escape'), 'junction');
    await expect(
      publicFilePath(path.join(root, 'public'), ['javascript', 'escape', 'private.txt'])
    ).rejects.toThrow('escapes');
    app.get('/invalid', async (req, res) => servePublicFile(req, res, root, ['..'], 'text/plain'));
    mkdirSync(path.join(root, 'public/javascript/directory'));
    for (const url of [
      '/external/resources/javascript/directory',
      '/external/resources/javascript/missing.js',
      '/external/resources/javascript/escape',
    ])
      expect((await app.inject(url)).statusCode).toBe(404);
    expect((await app.inject('/invalid')).statusCode).toBe(400);
  });
  it('handles additional valid, unsupported and invalid byte ranges', () => {
    for (const value of ['items=0-2', undefined]) expect(byteRange(value, 10)).toBeUndefined();
    for (const [value, size] of [
      ['bytes=-', 10],
      ['bytes=-9007199254740992', 10],
      ['bytes=9007199254740992-', 10],
      ['bytes=0-9007199254740992', 10],
      ['bytes=0-', 0],
    ] as const)
      expect(byteRange(value, size)).toBeNull();
    expect(byteRange('bytes=-100', 10)).toEqual({ start: 0, end: 9 });
  });
  it('handles HEAD, date validators, validator precedence and If-Range', async () => {
    const url = `${media}/progressive/mp4/720p.mp4`,
      first = await app.inject(url),
      modified = String(first.headers['last-modified']);
    const head = await app.inject({ method: 'HEAD', url, headers: { range: 'bytes=0-15' } });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe('1000');
    expect((await app.inject({ url, headers: { 'if-modified-since': modified } })).statusCode).toBe(
      200
    );
    expect(
      (
        await app.inject({
          url,
          headers: { 'if-modified-since': modified, 'if-none-match': '"different"' },
        })
      ).statusCode
    ).toBe(200);
    expect((await app.inject({ url, headers: { 'if-none-match': '*' } })).statusCode).toBe(304);
    for (const value of ['invalid', 'W/"old"', '"old"', new Date(0).toUTCString()])
      expect(
        (await app.inject({ url, headers: { range: 'bytes=0-15', 'if-range': value } })).statusCode
      ).toBe(200);
    expect(
      (await app.inject({ url, headers: { range: 'bytes=0-15', 'if-range': modified } })).statusCode
    ).toBe(200);
    const js = '/external/resources/javascript/app.js',
      asset = await app.inject(js);
    const unchanged = await app.inject({
      url: js,
      headers: { 'if-none-match': String(asset.headers.etag), 'accept-encoding': 'gzip' },
    });
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.headers.vary).toContain('Accept-Encoding');
    const jsHead = await app.inject({
      method: 'HEAD',
      url: js,
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(jsHead.body).toBe('');
    expect(jsHead.headers['content-encoding']).toBe('gzip');
    utimesSync(
      path.join(root, 'public/javascript/app.js'),
      new Date(),
      new Date(Date.now() + 2000)
    );
    expect(
      (await app.inject({ url: js, headers: { 'if-none-match': String(asset.headers.etag) } }))
        .statusCode
    ).toBe(200);
  });

  it('does not grant VOD caching to a static alias of active media or master playlists', async () => {
    const folder = path.join(root, `videos/${video}/adaptive/m3u8`);
    writeFileSync(
      path.join(folder, 'manifest-720p.m3u8'),
      '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:12\n#EXTINF:2,\nsegment-12.ts\n'
    );
    for (const type of ['static', 'dynamic']) {
      const response = await app.inject(
        `${media}/adaptive/m3u8/${type}/manifests/manifest-720p.m3u8`
      );
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=1, must-revalidate'
      );
    }
    writeFileSync(
      path.join(folder, 'manifest-master.m3u8'),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttps://node/external/videos/id/adaptive/m3u8/dynamic/manifests/a.m3u8\n'
    );
    expect(
      (await app.inject(`${media}/adaptive/m3u8/static/manifests/manifest-master.m3u8`)).headers[
        'cache-control'
      ]
    ).toBe('public, max-age=0, s-maxage=1, must-revalidate');
    writeFileSync(
      path.join(folder, 'manifest-720p.m3u8'),
      '#EXTM3U\n#EXTINF:2,\nsegment-12.ts\n#EXT-X-ENDLIST\n'
    );
    expect(
      (await app.inject(`${media}/adaptive/m3u8/static/manifests/manifest-720p.m3u8`)).headers[
        'cache-control'
      ]
    ).toContain('s-maxage=31536000');
  });
  it('microcaches GET and HEAD snapshots but never revalidates live files using static validators', async () => {
    const file = path.join(root, `videos/${video}/adaptive/m3u8/manifest-720p.m3u8`);
    const url = `${media}/adaptive/m3u8/dynamic/manifests/manifest-720p.m3u8`;
    const active = '#EXTM3U\r\n#EXT-X-TARGETDURATION:2\r\n#EXTINF:2,\r\nsegment-run-0.ts\r\n';
    writeFileSync(file, active);
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({
        method,
        url,
        headers: {
          'if-none-match': '*',
          'if-modified-since': new Date(Date.now() + 10000).toUTCString(),
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=1, must-revalidate'
      );
      expect(response.headers.etag).toBeUndefined();
      expect(response.headers['last-modified']).toBeUndefined();
      expect(response.body).toBe(method === 'HEAD' ? '' : active);
    }
    writeFileSync(file, active + '#EXT-X-ENDLIST\r\n');
    const terminal = await app.inject(url);
    expect(terminal.headers['cache-control']).toBe('no-store');
    expect(terminal.body).toContain('ENDLIST');
    writeFileSync(file, active.replace('segment-run-0', 'segment-next-0'));
    const resumed = await app.inject(url);
    expect(resumed.headers['cache-control']).toContain('s-maxage=1');
    expect(resumed.body).toContain('segment-next-0');
    expect(resumed.body).not.toContain('ENDLIST');
  });
  it('does not cache a finalized master through the dynamic alias', async () => {
    writeFileSync(
      path.join(root, `videos/${video}/adaptive/m3u8/manifest-master.m3u8`),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n'
    );
    const terminal = await app.inject(
      `${media}/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8`
    );
    expect(terminal.headers['cache-control']).toBe('no-store');
    const vod = await app.inject(`${media}/adaptive/m3u8/static/manifests/manifest-master.m3u8`);
    expect(vod.headers['cache-control']).toContain('s-maxage=31536000');
  });
  it('microcaches recorded Client playlists with fixed-width target durations', async () => {
    const file = path.join(root, `videos/${video}/adaptive/m3u8/manifest-720p.m3u8`);
    // PlaylistArchive emits this fixed-width integer header for recorded live streams.
    const active =
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:0000000002\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:2,\nsegment-run-0.ts\n';
    writeFileSync(file, active);
    for (const type of ['static', 'dynamic']) {
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await app.inject({
          method,
          url: `${media}/adaptive/m3u8/${type}/manifests/manifest-720p.m3u8`,
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe(
          'public, max-age=0, s-maxage=1, must-revalidate'
        );
        expect(response.body).toBe(method === 'HEAD' ? '' : active);
      }
    }
    writeFileSync(file, active + '#EXT-X-ENDLIST\n');
    for (const method of ['GET', 'HEAD'] as const) {
      const terminal = await app.inject({
        method,
        url: `${media}/adaptive/m3u8/dynamic/manifests/manifest-720p.m3u8`,
      });
      expect(terminal.headers['cache-control']).toBe('no-store');
    }
  });
  it('keeps startup, invalid and missing playlist responses uncached', async () => {
    const file = path.join(root, `videos/${video}/adaptive/m3u8/manifest-720p.m3u8`);
    const url = `${media}/adaptive/m3u8/dynamic/manifests/manifest-720p.m3u8`;
    for (const content of [
      '',
      '#EXTM3U\n',
      '#EXTM3U\n#EXT-X-TARGETDURATION:2\n',
      'invalid\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nx.ts\n',
      '#EXTM3U\n#EXTINF:2,\nx.ts\n',
      ...['0', '0000000000', '-2', '2.0', '1e1'].map(
        (target) => `#EXTM3U\n#EXT-X-TARGETDURATION:${target}\n#EXTINF:2,\nx.ts\n`
      ),
    ]) {
      writeFileSync(file, content);
      expect((await app.inject(url)).headers['cache-control']).toBe('no-store');
    }
    rmSync(file);
    const missing = await app.inject(url);
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    const invalid = await app.inject(`${media}/adaptive/m3u8/invalid/manifests/manifest-720p.m3u8`);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['cache-control']).toBe('no-store');
  });

  it('streams the same file generation used for headers during atomic replacement', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const filename = path.join(root, `videos/${video}/progressive/mp4/720p.mp4`);
    const replacement = filename + '.next';
    writeFileSync(replacement, Buffer.alloc(2000, 99));
    const snapshot = filename + '.snapshot';
    await actual.copyFile(filename, snapshot);
    vi.mocked(promises.open).mockImplementationOnce(async () => {
      // Represent an already-open old generation without depending on Windows rename sharing.
      const handle = await actual.open(snapshot, 'r');
      await actual.rename(replacement, filename);
      return handle;
    });
    const response = await app.inject(`${media}/progressive/mp4/720p.mp4`);
    expect(response.headers['content-length']).toBe('1000');
    expect(response.rawPayload).toHaveLength(1000);
    expect(response.rawPayload[0]).toBe(0);
    const next = await app.inject(`${media}/progressive/mp4/720p.mp4`);
    expect(next.rawPayload).toEqual(Buffer.alloc(2000, 99));
  });

  it('closes and serves an empty static file correctly', async () => {
    writeFileSync(path.join(root, 'public/javascript/app.js'), '');
    const response = await app.inject('/external/resources/javascript/app.js');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers['content-length']).toBe('0');
  });

  it('serves relative playlists unchanged with ordinary length and conditional HTTP headers', async () => {
    const file = path.join(root, `videos/${video}/adaptive/m3u8/manifest-master.m3u8`);
    const original = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n`;
    writeFileSync(file, original);
    const url = `${media}/adaptive/m3u8/static/manifests/manifest-master.m3u8`;
    const response = await app.inject(url);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(original)));
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(
      (
        await app.inject({
          url,
          headers: { 'if-modified-since': new Date(Date.now() + 60000).toUTCString() },
        })
      ).statusCode
    ).toBe(200);
    expect(
      (await app.inject({ url, headers: { 'if-none-match': String(response.headers.etag) } }))
        .statusCode
    ).toBe(304);
  });

  it('recognizes a relative live master through its static alias without granting VOD caching', async () => {
    writeFileSync(
      path.join(root, `videos/${video}/adaptive/m3u8/manifest-master.m3u8`),
      '#EXTM3U\n#MOARTUBE-LIVE\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n'
    );
    for (const type of ['static', 'dynamic']) {
      const response = await app.inject(
        `${media}/adaptive/m3u8/${type}/manifests/manifest-master.m3u8`
      );
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=1, must-revalidate'
      );
      expect(response.headers.etag).toBeUndefined();
    }
  });

  it('forwards file read failures through the compression stream', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('read failed'));
      },
    });
    const originalOpen = (
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    ).open;
    vi.mocked(promises.open).mockImplementationOnce(async (...args) => {
      const handle = await originalOpen(...args);
      vi.spyOn(handle, 'createReadStream').mockReturnValueOnce(stream as fs.ReadStream);
      stream.once('close', () => {
        void handle.close();
      });
      return handle;
    });
    try {
      const response = await app.inject({
        url: '/external/resources/javascript/app.js',
        headers: { 'accept-encoding': 'gzip' },
      });
      expect(response.statusCode).toBe(500);
    } finally {
      vi.mocked(promises.open).mockImplementation(originalOpen);
    }
  });
});
