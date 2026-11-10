// Regression coverage for the cache audit's reproduced correctness gaps.
import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { SettingsController } from '@/controllers/settings.js';
import { servePublicFile } from '@/utils/public-file.js';
import { installCachePolicy } from '@/plugins/cache-policy.js';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { videosRoutes } from '@/routes/videos.js';
import { CommentsService } from '@/services/comments.js';
import { CloudflareService } from '@/services/cloudflare.js';
import axios from 'axios';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { Logger } from '@/utils/logger.js';
import { openTestDatabase, video, comment } from '../integration/sqlite/helpers.js';

const cfg = vi.hoisted(() => ({ value: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => cfg.value }));
vi.mock('axios');
const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

it.each(['avatar', 'icon', 'banner'])(
  'keeps the complete %s visible during replacement and after an interrupted upload',
  async (kind) => {
    const root = await mkdtemp(path.join(tmpdir(), 'moartube-audit-image-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const images = path.join(root, 'images');
    await mkdir(images);
    const filename = kind + '.png';
    await writeFile(path.join(images, filename), 'previous-complete-image');
    cfg.value = { paths: { imagesDirectoryPath: images } };
    const purgeNodeImages = vi.fn().mockResolvedValue(undefined);
    const controller = new SettingsController(
      {} as never,
      {} as never,
      { purgeNodeImages } as never,
      {} as never
    );
    const input = new PassThrough();
    let status = 200;
    const reply: any = {
      status: (code: number) => {
        status = code;
        return reply;
      },
      send: () => reply,
    };
    const request: any = {
      parts: async function* () {
        yield { type: 'file', fieldname: kind + 'File', file: input };
      },
    };
    const upload =
      kind === 'banner'
        ? controller.uploadBanner(request, reply)
        : controller.uploadAvatar(request, reply);
    input.write('partial');
    await expect
      .poll(async () => (await readdir(images)).some((name) => name.endsWith('.part')))
      .toBe(true);
    const app = Fastify();
    cleanup.push(() => app.close());
    installCachePolicy(app);
    app.get('/external/resources/images/' + filename, (req, res) =>
      servePublicFile(req, res, images, [filename], 'image/png')
    );
    const response = await app.inject('/external/resources/images/' + filename);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('previous-complete-image');
    expect(response.headers['cache-control']).toContain('s-maxage=30');
    expect(purgeNodeImages).not.toHaveBeenCalled();
    input.destroy(new Error('simulated upload failure'));
    await upload;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await readFile(path.join(images, filename), 'utf8')).toBe('previous-complete-image');
    expect((await readdir(images)).some((name) => name.endsWith('.part'))).toBe(false);
    expect(purgeNodeImages).not.toHaveBeenCalled();
  }
);

it('purges a committed earlier image even when a later multipart image is truncated', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'moartube-audit-multipart-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'avatar.png'), 'old avatar');
  cfg.value = { paths: { imagesDirectoryPath: root } };
  const purgeNodeImages = vi.fn().mockResolvedValue(undefined);
  const controller = new SettingsController(
    {} as never,
    {} as never,
    { purgeNodeImages } as never,
    {} as never
  );
  const first = new PassThrough();
  first.end('complete icon');
  const second = new PassThrough() as PassThrough & { truncated: boolean };
  second.truncated = true;
  second.end('truncated avatar');
  let status = 200;
  const reply: any = {
    status: (value: number) => {
      status = value;
      return reply;
    },
    send: () => reply,
  };
  await controller.uploadAvatar(
    {
      parts: async function* () {
        yield { type: 'file', fieldname: 'iconFile', file: first };
        yield { type: 'file', fieldname: 'avatarFile', file: second };
      },
    } as any,
    reply
  );
  expect(status).toBe(500);
  expect(await readFile(path.join(root, 'icon.png'), 'utf8')).toBe('complete icon');
  expect(await readFile(path.join(root, 'avatar.png'), 'utf8')).toBe('old avatar');
  expect(purgeNodeImages).toHaveBeenCalledOnce();
});

it('purges comment state, bodies, deltas and replies through a revision-independent prefix', async () => {
  cfg.value = {
    paths: {},
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
    },
    getNodeBaseUrl: () => 'https://node.example',
  };
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  const cdn = new CloudflareService(Logger.getInstance());
  await cdn.purgeComments('auditCache1');
  expect(post).toHaveBeenCalledWith('/zones/zone/purge_cache', {
    prefixes: ['node.example/videos/auditCache1/comments'],
  });
  await cdn.purgeComments();
  expect(post).toHaveBeenLastCalledWith('/zones/zone/purge_cache', {
    prefixes: ['node.example/videos/'],
  });
});

it('invalidates all cached comment revisions when the comment is deleted', async () => {
  const database = openTestDatabase();
  cleanup.push(() => database.close());
  cfg.value = { nodeSettings: { isCommentsEnabled: true, isCloudflareTurnstileEnabled: false } };
  const id = 'auditCache1';
  const comments = createCommentsRepository('sqlite', database.db);
  await createVideosRepository('sqlite', database.db).create(video(id));
  const created = await comments.create(comment(id, 100));
  const purgeHomePage = vi.fn().mockResolvedValue(undefined);
  const purgePrefixes = vi.fn().mockResolvedValue(undefined);
  const purgeFiles = vi.fn().mockResolvedValue(undefined);
  const purgeComments = vi.fn().mockResolvedValue(undefined);
  const services: any = {
    commentsService: new CommentsService(Logger.getInstance(), comments),
    videosService: {},
    videoUploadService: {},
    reportsService: {},
    cloudflareService: { purgeHomePage, purgePrefixes, purgeFiles, purgeComments },
  };
  const app = Fastify();
  cleanup.push(() => app.close());
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('optionalAuthenticate', async () => {});
  app.decorate('authenticate', async () => {});
  await app.register(
    async (scope) =>
      videosRoutes(scope as never, { resolve: (name: string) => services[name] } as never),
    { prefix: '/videos' }
  );
  const base = `/videos/${id}/comments`;
  const state = (await app.inject(base + '/state')).json();
  const url = `${base}/${created.comment_id}?epoch=${state.epoch}&revision=${state.version}`;
  const cached = await app.inject(url);
  expect(cached.headers['cache-control']).toContain('s-maxage=3600');
  expect(cached.headers['cache-tag']).toBeUndefined();
  const removed = await app.inject({
    method: 'DELETE',
    url: `${base}/${created.comment_id}/delete?timestamp=100`,
  });
  expect(removed.statusCode).toBe(200);
  expect((await app.inject(url)).statusCode).toBe(404);
  expect(purgeHomePage).toHaveBeenCalledWith();
  expect(purgeComments).toHaveBeenCalledWith(id);
  expect(purgePrefixes).not.toHaveBeenCalled();
  expect(purgeFiles).not.toHaveBeenCalled();
  // The broad purge includes this old identity, despite its long response TTL.
  expect(cached.json().comment.commentId).toBe(created.comment_id);
});

it('purges the image prefix rather than a literal directory URL', async () => {
  cfg.value = {
    paths: {},
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
    },
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  const services: any = {
    commentsService: {},
    videosService: {},
    videoUploadService: {},
    reportsService: {},
    cloudflareService: new CloudflareService(Logger.getInstance()),
  };
  const app = Fastify();
  cleanup.push(() => app.close());
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('optionalAuthenticate', async () => {});
  app.decorate('authenticate', async () => {});
  await app.register(
    async (scope) =>
      videosRoutes(scope as never, { resolve: (name: string) => services[name] } as never),
    { prefix: '/videos' }
  );
  const response = await app.inject({
    method: 'POST',
    url: '/videos/auditCache1/cache/invalidate',
    payload: { paths: ['images/'] },
  });
  expect(response.statusCode).toBe(200);
  expect(post).toHaveBeenCalledOnce();
  expect(post.mock.calls[0]![1]).toEqual({
    prefixes: ['media.example/external/videos/auditCache1/images/'],
  });
});
