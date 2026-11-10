import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, readFile, utimes, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { readSync, utimesSync, readdirSync, rmdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { acquireFileLock } from '@/utils/file-lock.js';
import { writeUpload } from '@/utils/stream-files.js';
import { storageIdentity } from '@/utils/cdn-settings.js';
import { assetUrl, retainedAssetPath } from '@/utils/asset-url.js';
import { servePublicFile } from '@/utils/public-file.js';
import { VideoUploadService } from '@/services/video-upload.js';
import { SettingsController } from '@/controllers/settings.js';
import { migrateStorage } from '@/services/storage-migration.js';

const config = vi.hoisted(() => ({ current: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => config.current }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  const readdir = vi.fn(actual.readdirSync);
  return {
    ...actual,
    readSync: vi.fn(actual.readSync),
    readdirSync: readdir,
    default: { ...actual.default, readdirSync: readdir },
  };
});
vi.mock('@/services/storage-migration.js', () => ({ migrateStorage: vi.fn() }));
vi.mock('@/utils/distribution-admission.js', () => ({
  withDistributionTransition: (operation: () => unknown) => operation(),
}));
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'moartube-publication-'));
  config.current = {
    paths: {
      dataDirectoryPath: path.join(root, 'data'),
      publicDirectoryPath: path.join(root, 'public'),
      videosDirectoryPath: path.join(root, 'videos'),
    },
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
});

it('rejects migration into an active bucket through an explicit AWS endpoint alias before copying', async () => {
  const provider = {
    region: 'us-east-1',
    forcePathStyle: false,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  };
  const source = { bucketName: 'active', s3ProviderClientConfig: provider };
  config.current.nodeSettings = { storageConfig: { storageMode: 's3provider', s3Config: source } };
  const controller = new SettingsController({} as never, {} as never, {} as never, {} as never);
  const app = Fastify();
  app.post('/migrate', controller.migrateStorage);
  try {
    const result = await app.inject({
      method: 'POST',
      url: '/migrate',
      payload: {
        direction: 'filesystem-to-s3',
        destination: {
          ...source,
          s3ProviderClientConfig: { ...provider, endpoint: 'https://s3.us-east-1.amazonaws.com' },
        },
      },
    });
    expect(result.statusCode).toBe(409);
    expect(migrateStorage).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('recognizes active AWS storage across default, regional, acceleration and transport aliases', () => {
  const storage = (endpoint?: string, region = 'us-east-1') =>
    ({
      storageMode: 's3provider',
      s3Config: {
        bucketName: 'active',
        s3ProviderClientConfig: {
          endpoint,
          region,
          forcePathStyle: false,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
      },
    }) as any;
  const original = storageIdentity(storage());
  for (const endpoint of [
    'https://s3.us-east-1.amazonaws.com',
    'https://s3.amazonaws.com',
    'http://s3.us-west-2.amazonaws.com/',
    'https://s3.dualstack.us-east-1.amazonaws.com',
    'https://s3-fips.dualstack.us-east-1.amazonaws.com',
    'https://s3-accelerate.amazonaws.com',
  ])
    expect(storageIdentity(storage(endpoint))).toBe(original);
  expect(storageIdentity(storage('https://s3.cn-north-1.amazonaws.com.cn', 'cn-north-1'))).not.toBe(
    original
  );
  expect(storageIdentity(storage('https://storage.example/'))).toBe(
    storageIdentity(storage('http://STORAGE.example', 'auto'))
  );
});

it('atomically replaces concurrent uploads and invalidates the replaced segment', async () => {
  const cdn = { isEnabled: () => true, purgeFiles: vi.fn() };
  const service = new VideoUploadService({} as never, cdn as never, {} as never, logger as never);
  const folder = path.join(root, 'videos/one/adaptive/m3u8/720p');
  const a = new PassThrough(),
    b = new PassThrough();
  const first = service.saveUploadedFile({ filename: 'same.ts', file: a } as never, folder);
  const second = service.saveUploadedFile({ filename: 'same.ts', file: b } as never, folder);
  a.end('first');
  await first;
  b.end('second');
  await second;
  expect(await readFile(path.join(folder, 'same.ts'), 'utf8')).toBe('second');
  expect(cdn.purgeFiles).toHaveBeenCalledExactlyOnceWith([
    'https://media.example/external/videos/one/adaptive/m3u8/720p/segments/same.ts',
  ]);
});

it('retries publication when a competing owner removes its lock before directory inspection', async () => {
  const file = path.join(root, 'released.ts');
  const directory = file + '.writer-lock';
  await mkdir(directory);
  vi.mocked(readdirSync).mockImplementationOnce(() => {
    rmdirSync(directory);
    throw Object.assign(new Error('Owner released its lock'), { code: 'ENOENT' });
  });
  const input = new PassThrough();
  input.end('complete');
  await expect(writeUpload({ file: input }, file, 100)).resolves.toBe(false);
  expect(await readFile(file, 'utf8')).toBe('complete');
  expect(vi.mocked(readdirSync)).toHaveBeenCalledWith(directory);
});

it('retains hash-addressed bytes outside the replaceable public directory across deployment/removal', async () => {
  const publicRoot = config.current.paths.publicDirectoryPath;
  await mkdir(path.join(publicRoot, 'javascript'), { recursive: true });
  const file = path.join(publicRoot, 'javascript/player.js');
  await writeFile(file, 'release one');
  const first = assetUrl('/external/resources/javascript/player.js');
  await writeFile(file, 'release two');
  const second = assetUrl('/external/resources/javascript/player.js');
  await rm(publicRoot, { recursive: true });
  vi.resetModules();
  const { servePublicFile: restartedServe } = await import('@/utils/public-file.js');
  const app = Fastify();
  app.get('/external/resources/javascript/player.js', (req, reply) =>
    restartedServe(req, reply, publicRoot, ['javascript', 'player.js'], 'application/javascript')
  );
  try {
    expect((await app.inject(first)).body).toBe('release one');
    const latest = await app.inject(second);
    expect(latest.body).toBe('release two');
    expect(latest.headers['cache-control']).toContain('immutable');
    expect(
      (await app.inject('/external/resources/javascript/player.js?v=' + '0'.repeat(64))).statusCode
    ).toBe(404);
  } finally {
    await app.close();
  }
});

it('memoizes a stable publication, republishes a missing artifact, and updates after replacement', async () => {
  const publicRoot = config.current.paths.publicDirectoryPath;
  await mkdir(path.join(publicRoot, 'javascript'), { recursive: true });
  const file = path.join(publicRoot, 'javascript/memo.js');
  await writeFile(file, 'release one');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
  const first = assetUrl('/external/resources/javascript/memo.js');
  const reads = vi.mocked(readSync).mock.calls.length;
  expect(assetUrl('/external/resources/javascript/memo.js')).toBe(first);
  expect(vi.mocked(readSync).mock.calls).toHaveLength(reads);
  await rm(retainedAssetPath(['javascript', 'memo.js'], first.split('=')[1]!));
  expect(assetUrl('/external/resources/javascript/memo.js')).toBe(first);
  expect(vi.mocked(readSync).mock.calls.length).toBeGreaterThan(reads);
  await writeFile(path.join(publicRoot, 'javascript/next.js'), 'release two');
  await rename(path.join(publicRoot, 'javascript/next.js'), file);
  expect(assetUrl('/external/resources/javascript/memo.js')).not.toBe(first);
});

it('refuses to publish bytes when the opened asset changes during its snapshot read', async () => {
  const publicRoot = config.current.paths.publicDirectoryPath;
  await mkdir(path.join(publicRoot, 'javascript'), { recursive: true });
  const file = path.join(publicRoot, 'javascript/changing.js');
  await writeFile(file, 'release one');
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(readSync).mockImplementationOnce((...args: any[]) => {
    const count = (actual.readSync as any)(...args);
    utimesSync(file, new Date(), new Date(Date.now() + 10000));
    return count;
  });
  expect(() => assetUrl('/external/resources/javascript/changing.js')).toThrow(
    'Asset changed while being published'
  );
});

it('serializes object publication across separate processes while a shared publication lock is held', async () => {
  const compiled = path.join(root, 'compiled');
  await mkdir(compiled);
  await writeFile(path.join(compiled, 'package.json'), '{"type":"module"}');
  for (const name of ['stream-files', 'file-lock']) {
    const source = await readFile('src/utils/' + name + '.ts', 'utf8');
    await writeFile(
      path.join(compiled, name + '.js'),
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText
    );
  }
  const file = path.join(root, 'shared.ts');
  const release = acquireFileLock(file);
  const program = `
    import {Readable} from 'node:stream';
    const {writeUpload}=await import(process.argv[1]);
    process.stdout.write('ready\\n');
    const replaced=await writeUpload({file:Readable.from([process.argv[3]])},process.argv[2],100);
    process.stdout.write(JSON.stringify(replaced));
  `;
  const runs = ['one', 'two'].map((body) => {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        program,
        pathToFileURL(path.join(compiled, 'stream-files.js')).href,
        file,
        body,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '',
      stderr = '';
    let ready: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.includes('ready\n')) ready();
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const done = new Promise<boolean>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        ready();
        if (code !== 0) reject(new Error(stderr || 'child failed'));
        else resolve(JSON.parse(stdout.slice('ready\n'.length)));
      });
    });
    return { started, done, output: () => stdout, child };
  });
  try {
    await Promise.all(runs.map((run) => run.started));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(runs.map((run) => run.output())).toEqual(['ready\n', 'ready\n']);
    release();
    expect((await Promise.all(runs.map((run) => run.done))).sort()).toEqual([false, true]);
  } catch (error) {
    for (const run of runs) run.child.kill();
    try {
      release();
    } catch {
      /* released above */
    }
    throw error;
  }
});

it('rejects obsolete metadata validators after timestamp-preserving replacement and unsafe If-Range dates', async () => {
  const file = path.join(root, 'media.mp4');
  const time = new Date('2026-01-01T00:00:00.000Z');
  await writeFile(file, 'AAAA');
  await utimes(file, time, time);
  const app = Fastify();
  app.get('/media', (req, reply) =>
    servePublicFile(req, reply, root, ['media.mp4'], 'video/mp4', { ranges: true })
  );
  try {
    const original = await app.inject('/media');
    await writeFile(path.join(root, 'replacement.mp4'), 'BBBB');
    await utimes(path.join(root, 'replacement.mp4'), time, time);
    await rename(path.join(root, 'replacement.mp4'), file);
    const changed = await app.inject({
      url: '/media',
      headers: { 'if-none-match': String(original.headers.etag) },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.body).toBe('BBBB');
    expect(
      (
        await app.inject({
          url: '/media',
          headers: { 'if-none-match': String(changed.headers.etag) },
        })
      ).statusCode
    ).toBe(304);
    for (const date of [
      String(original.headers['last-modified']),
      'Tue, 01 Jan 2030 00:00:00 GMT',
    ]) {
      const range = await app.inject({
        url: '/media',
        headers: { range: 'bytes=1-2', 'if-range': date },
      });
      expect(range.statusCode).toBe(200);
      expect(range.body).toBe('BBBB');
    }
    const unconditional = await app.inject({ url: '/media', headers: { range: 'bytes=1-2' } });
    expect(unconditional.statusCode).toBe(206);
    expect(unconditional.body).toBe('BB');
  } finally {
    await app.close();
  }
});
