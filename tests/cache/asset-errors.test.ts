import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  assetUrl,
  assetVersion,
  retainAsset,
  retainedAssetPath,
  pruneRetainedAssets,
} from '@/utils/asset-url.js';
import { servePublicFile } from '@/utils/public-file.js';
const state = vi.hoisted(() => ({ paths: {} as any, actual: {} as any }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  state.actual = actual;
  return {
    ...actual,
    openSync: vi.fn(actual.openSync),
    readSync: vi.fn(actual.readSync),
    fstatSync: vi.fn(actual.fstatSync),
  };
});
vi.mock('@/config/index.js', () => ({ getConfig: () => state }));
let root: string, file: string;
beforeEach(() => {
  for (const name of ['openSync', 'readSync', 'fstatSync'] as const)
    vi.mocked(fs[name]).mockReset().mockImplementation(state.actual[name]);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-asset-errors-'));
  state.paths = { dataDirectoryPath: root, publicDirectoryPath: path.join(root, 'public') };
  fs.mkdirSync(path.join(root, 'public/javascript'), { recursive: true });
  file = path.join(root, 'public/javascript/app.js');
  fs.writeFileSync(file, 'complete bytes');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('ignores foreign directories, category files and nested directories during retained-asset cleanup', () => {
  const base = path.join(root, 'cache/assets');
  fs.mkdirSync(path.join(base, 'invalid'), { recursive: true });
  fs.writeFileSync(path.join(base, 'foreign'), '');
  const version = path.join(base, 'a'.repeat(64));
  fs.mkdirSync(path.join(version, 'unknown'), { recursive: true });
  fs.writeFileSync(path.join(version, 'fonts'), '');
  fs.mkdirSync(path.join(version, 'javascript/nested'), { recursive: true });
  expect(pruneRetainedAssets()).toEqual({ bytes: 0, files: 0 });
  expect(fs.existsSync(path.join(version, 'javascript/nested'))).toBe(true);
});
it('reuses a stable publication and refreshes its retention timestamp after an hour', () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
  const version = retainAsset(file, ['javascript', 'app.js']);
  expect(retainAsset(file, ['javascript', 'app.js'])).toBe(version);
  clock.mockReturnValue(now + 3600001);
  expect(retainAsset(file, ['javascript', 'app.js'])).toBe(version);
  const descriptor = fs.openSync(file, 'r');
  try {
    expect(assetVersion(file, descriptor)).toBe(version);
    expect(retainAsset(file, ['javascript', 'app.js'], descriptor)).toBe(version);
    expect(fs.fstatSync(descriptor).size).toBeGreaterThan(0);
  } finally {
    fs.closeSync(descriptor);
  }
});
it('bounds publication lookup entries while retaining advertised bytes on disk', () => {
  for (let index = 0; index < 514; index++) {
    const current = path.join(root, 'public/javascript', `file${index}.js`);
    fs.writeFileSync(current, 'same content');
    retainAsset(current, ['javascript', 'app.js']);
  }
  expect(fs.existsSync(path.join(root, 'cache/assets'))).toBe(true);
});
it('refuses incomplete reads and metadata changes during snapshot publication', () => {
  const read = vi.spyOn(fs, 'readSync').mockReturnValueOnce(0);
  expect(() => assetVersion(file)).toThrow('changed while being published');
  read.mockRestore();
  const actual = fs.fstatSync;
  const descriptor = fs.openSync(file, 'r');
  const info = actual(descriptor, { bigint: true });
  fs.closeSync(descriptor);
  vi.spyOn(fs, 'fstatSync')
    .mockReturnValueOnce(info as never)
    .mockReturnValueOnce({ ...info, ino: info.ino + 1n } as never);
  expect(() => assetVersion(file)).toThrow('changed while being published');
});
it('falls back on disk exhaustion but preserves unexpected publication errors', () => {
  const open = vi.spyOn(fs, 'openSync').mockImplementation(() => {
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  });
  expect(assetUrl('/external/resources/javascript/app.js?old=1')).toBe(
    '/external/resources/javascript/app.js?cache=off'
  );
  open.mockImplementation(() => {
    throw new Error('permission denied');
  });
  expect(() => assetUrl('/external/resources/javascript/app.js')).toThrow('permission denied');
});
it('reconstructs a missing retained asset only when its current bytes match the advertised version', async () => {
  const version = assetVersion(file);
  const app = Fastify();
  app.get('/asset', (request, reply) =>
    servePublicFile(
      request,
      reply,
      state.paths.publicDirectoryPath,
      ['javascript', 'app.js'],
      'application/javascript'
    )
  );
  try {
    expect((await app.inject('/asset?v=' + version)).statusCode).toBe(200);
    expect(fs.existsSync(retainedAssetPath(['javascript', 'app.js'], version))).toBe(true);
    expect((await app.inject('/asset?v=' + 'b'.repeat(64))).statusCode).toBe(404);
  } finally {
    await app.close();
  }
});

it('leaves non-assets unchanged and returns unversioned URLs for missing packaged files', () => {
  expect(assetUrl('/images/avatar.png')).toBe('/images/avatar.png');
  expect(assetUrl('/external/resources/javascript/missing.js?old=1')).toBe(
    '/external/resources/javascript/missing.js'
  );
});

it('serves retained binary assets with strong validators and date-based conditional ranges', async () => {
  const font = path.join(root, 'public/fonts/font.woff2');
  fs.mkdirSync(path.dirname(font), { recursive: true });
  fs.writeFileSync(font, 'fontbytes');
  const version = retainAsset(font, ['fonts', 'font.woff2']);
  const app = Fastify();
  app.get('/font', (request, reply) =>
    servePublicFile(
      request,
      reply,
      state.paths.publicDirectoryPath,
      ['fonts', 'font.woff2'],
      'font/woff2',
      { ranges: true }
    )
  );
  app.get('/root', (request, reply) =>
    servePublicFile(request, reply, state.paths.publicDirectoryPath, [], 'application/octet-stream')
  );
  try {
    const url = '/font?v=' + version;
    const original = await app.inject(url);
    expect(original.headers.etag).toBe('"' + version + '"');
    expect(
      (
        await app.inject({
          url,
          headers: { 'if-modified-since': String(original.headers['last-modified']) },
        })
      ).statusCode
    ).toBe(304);
    expect(
      (
        await app.inject({
          url,
          headers: { range: 'bytes=0-1', 'if-range': String(original.headers.etag) },
        })
      ).statusCode
    ).toBe(206);
    expect(
      (
        await app.inject({
          url,
          headers: { range: 'bytes=0-1', 'if-range': String(original.headers['last-modified']) },
        })
      ).statusCode
    ).toBe(206);
    expect(
      (await app.inject({ url, headers: { range: 'bytes=0-1', 'if-range': 'invalid' } })).statusCode
    ).toBe(200);
    expect((await app.inject('/root')).statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
