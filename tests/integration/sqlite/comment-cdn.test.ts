import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { CommentsService } from '@/services/comments.js';
import { videosRoutes } from '@/routes/videos.js';
import { Logger } from '@/utils/logger.js';
import type { Container } from '@/core/container.js';
import { openTestDatabase, comment, video } from './helpers.js';

vi.mock('@config/index.js', () => ({
  getConfig: () => ({
    nodeSettings: { isCommentsEnabled: true, isCloudflareTurnstileEnabled: false },
  }),
}));

const id = 'cdnTest0001';
const base = `/videos/${id}/comments`;
describe('comment HTTP CDN contract with a real database', () => {
  let database: ReturnType<typeof openTestDatabase>;
  let app: FastifyInstance;
  let comments: ReturnType<typeof createCommentsRepository>;
  let state: { epoch: string; version: number };
  let parent: number;
  const purge = vi.fn().mockResolvedValue(undefined);
  beforeEach(async () => {
    database = openTestDatabase();
    comments = createCommentsRepository('sqlite', database.db);
    const videos = createVideosRepository('sqlite', database.db);
    await videos.create(video(id));
    const row = await comments.create(comment(id, 100));
    parent = row.comment_id;
    const service = new CommentsService(Logger.getInstance(), comments);
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('optionalAuthenticate', async () => {});
    app.decorate('authenticate', async () => {});
    const services = {
      commentsService: service,
      videosService: { getVideo: async () => ({ is_comments_enabled: true }) },
      videoUploadService: {},
      reportsService: {},
      cloudflareService: { purgeWatchPages: purge },
    };
    await app.register(
      async (scoped) => {
        videosRoutes(scoped, {
          resolve: (name: keyof typeof services) => services[name],
        } as unknown as Container);
      },
      { prefix: '/videos' }
    );
    const result = await app.inject(base + '/state');
    expect(result.statusCode, result.body).toBe(200);
    state = result.json();
  });
  afterEach(async () => {
    await app?.close();
    database?.close();
    vi.clearAllMocks();
  });
  const key = (value: { epoch: string; version: number }) =>
    new URLSearchParams({ epoch: value.epoch, revision: String(value.version) }).toString();

  it('caches state briefly and requires origin reads for explicit refresh and authorization', async () => {
    expect((await app.inject(base + '/state')).headers['cache-control']).toContain('s-maxage=30');
    for (const response of [
      await app.inject(base + '/state?fresh=1'),
      await app.inject({ url: base + '/state', headers: { authorization: 'Bearer token' } }),
    ])
      expect(response.headers['cache-control']).toBe('no-store');
  });
  it('shares revisioned history, popups, replies and delta pages but not legacy URLs', async () => {
    for (const suffix of [
      `?type=before&sort=descending&timestamp=1000`,
      `/${parent}`,
      `/${parent}/replies`,
      '/cache?since=0',
    ]) {
      const url = base + suffix;
      const response = await app.inject(url + (url.includes('?') ? '&' : '?') + key(state));
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['cache-control']).toContain('s-maxage=3600');
      expect((await app.inject(url)).headers['cache-control']).toBe('no-store');
    }
  });
  it('a new reply changes the key and invalidates old parent metadata without a mass purge', async () => {
    const before = await app.inject(`${base}/${parent}?${key(state)}`);
    expect(before.json().comment.replyIds).toEqual([]);
    const created = await app.inject({
      method: 'POST',
      url: base + '/comment',
      payload: {
        commentPlainText: `>>${parent} new reply`,
        timestamp: 0,
        cloudflareTurnstileToken: '',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(purge).toHaveBeenCalledWith([id]);
    const next = (await app.inject(base + '/state?fresh=1')).json();
    expect(next.version).toBeGreaterThan(state.version);
    const oldKey = await app.inject(`${base}/${parent}?${key(state)}`);
    expect(oldKey.headers['cache-control']).toBe('no-store');
    const current = await app.inject(`${base}/${parent}?${key(next)}`);
    expect(current.json().comment.replyIds).toEqual([created.json().commentId]);
    expect(current.headers['cache-control']).toContain('s-maxage=3600');
  });
  it('administrative deletion is visible in both tombstones and versioned quote lookups', async () => {
    const removed = await app.inject({
      method: 'DELETE',
      url: `${base}/${parent}/delete?timestamp=100`,
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.headers['cache-control']).toBe('no-store');
    const next = (await app.inject(base + '/state?fresh=1')).json();
    const missing = await app.inject(`${base}/${parent}?${key(next)}`);
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    const delta = await app.inject(`${base}/cache?since=${state.version}&${key(next)}`);
    expect(delta.json().deletedIds).toContain(parent);
    expect(delta.headers['cache-control']).toContain('s-maxage=3600');
  });
  it('validation failures and unknown records never acquire a default edge TTL', async () => {
    for (const url of [
      base + '/state?fresh=invalid',
      base + '/0',
      `${base}/9999?${key(state)}`,
      base + '?type=bad',
      `${base}/${parent}?revision=-1`,
    ]) {
      const response = await app.inject(url);
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
