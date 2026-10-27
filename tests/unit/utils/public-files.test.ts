import fs from 'node:fs';
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
      304
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
    ).toBe(206);
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

  it('forwards file read failures through the compression stream', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('read failed'));
      },
    });
    const spy = vi.spyOn(fs, 'createReadStream').mockReturnValueOnce(stream as fs.ReadStream);
    try {
      const response = await app.inject({
        url: '/external/resources/javascript/app.js',
        headers: { 'accept-encoding': 'gzip' },
      });
      expect(response.statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
  });
});
