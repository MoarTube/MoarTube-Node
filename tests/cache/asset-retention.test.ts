import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, readFile, stat, utimes, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assetUrl,
  retainAsset,
  retainedAssetPath,
  pruneRetainedAssets,
  ASSET_RETENTION_LIMITS,
} from '@/utils/asset-url.js';
import { acquireFileLock } from '@/utils/file-lock.js';
import { servePublicFile } from '@/utils/public-file.js';
import { installCachePolicy } from '@/plugins/cache-policy.js';

const config = vi.hoisted(() => ({ current: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => config.current }));
let root: string, source: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moartube-asset-retention-'));
  await mkdir(path.join(root, 'public', 'javascript'), { recursive: true });
  source = path.join(root, 'public', 'javascript', 'app.js');
  await writeFile(source, 'original');
  config.current = {
    paths: { dataDirectoryPath: root, publicDirectoryPath: path.join(root, 'public') },
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('expires unused versions while preserving recently advertised releases', async () => {
  const version = retainAsset(source, ['javascript', 'app.js']);
  const old = retainedAssetPath(['javascript', 'app.js'], version);
  const stale = new Date(Date.now() - ASSET_RETENTION_LIMITS.maxAgeMs - 1000);
  await utimes(old, stale, stale);
  await writeFile(source, 'new release');
  const next = retainAsset(source, ['javascript', 'app.js']);
  const kept = retainedAssetPath(['javascript', 'app.js'], next);
  expect(pruneRetainedAssets()).toEqual({ files: 1, bytes: Buffer.byteLength('new release') });
  expect(existsSync(old)).toBe(false);
  expect(await readFile(kept, 'utf8')).toBe('new release');
  expect(existsSync(path.dirname(path.dirname(old)))).toBe(false);
});

it('renews an advertised old release before cleanup can evict it', async () => {
  const version = retainAsset(source, ['javascript', 'app.js']);
  const retained = retainedAssetPath(['javascript', 'app.js'], version);
  const stale = new Date(Date.now() - ASSET_RETENTION_LIMITS.maxAgeMs - 1000);
  await utimes(retained, stale, stale);
  expect(retainAsset(source, ['javascript', 'app.js'])).toBe(version);
  expect(pruneRetainedAssets().files).toBe(1);
  expect((await stat(retained)).mtimeMs).toBeGreaterThan(stale.getTime());
});

it('enforces the disk budget without deleting recently published bytes', async () => {
  const version = retainAsset(source, ['javascript', 'app.js'], undefined, { maxBytes: 10 });
  await writeFile(source, 'another version');
  expect(() => retainAsset(source, ['javascript', 'app.js'], undefined, { maxBytes: 10 })).toThrow(
    'byte budget'
  );
  expect(await readFile(retainedAssetPath(['javascript', 'app.js'], version), 'utf8')).toBe(
    'original'
  );
  expect(pruneRetainedAssets()).toEqual({ files: 1, bytes: 8 });
});

it('also bounds file count when versions contain empty files', async () => {
  await writeFile(source, '');
  retainAsset(source, ['javascript', 'app.js'], undefined, { maxBytes: 10, maxFiles: 1 });
  const next = path.join(root, 'public', 'javascript', 'empty.js');
  await writeFile(next, '');
  expect(() =>
    retainAsset(next, ['javascript', 'empty.js'], undefined, { maxBytes: 10, maxFiles: 1 })
  ).toThrow('file budget');
  expect(pruneRetainedAssets()).toEqual({ files: 1, bytes: 0 });
});

it('serves uncached current bytes when retention is unavailable instead of advertising a broken immutable URL', async () => {
  await mkdir(path.join(root, 'cache', 'assets'), { recursive: true });
  const release = acquireFileLock(path.join(root, 'cache', 'assets'));
  let url: string;
  try {
    url = assetUrl('/external/resources/javascript/app.js');
  } finally {
    release();
  }
  expect(url).toBe('/external/resources/javascript/app.js?cache=off');
  const app = Fastify();
  installCachePolicy(app);
  app.get('/external/resources/javascript/app.js', (request, reply) =>
    servePublicFile(
      request,
      reply,
      path.join(root, 'public'),
      ['javascript', 'app.js'],
      'application/javascript'
    )
  );
  try {
    const response = await app.inject(url);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('original');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  } finally {
    await app.close();
  }
});
