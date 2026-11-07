import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { nodeRoutes } from '@/routes/node.js';
import { videosRoutes } from '@/routes/videos.js';

vi.mock('@/config/index.js', () => ({
  getConfig: () => ({
    lastCheckedContentTracker: {
      lastCheckedCommentsTimestamp: 0,
      lastCheckedVideoReportsTimestamp: 0,
      lastCheckedCommentReportsTimestamp: 0,
    },
    updateLastCheckedContentTracker: vi.fn(),
  }),
}));

describe('Node moderation APIs and retired browsing routes', () => {
  it('removes old discovery routes while keeping video APIs and authenticated moderation state', async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.decorate('optionalAuthenticate', async () => {});
    app.decorate('authenticate', async (request, reply) => {
      if (request.headers.authorization !== 'Bearer admin') {
        await reply.code(401).send({ isError: true });
      }
    });
    const container = {
      resolve: (name: string) =>
        name === 'commentsService'
          ? { countCommentsNewerThan: async () => 2 }
          : name === 'reportsService'
            ? {
                countVideoReportsNewerThan: async () => 3,
                countCommentReportsNewerThan: async () => 4,
              }
            : {},
    };
    await app.register(
      async (scope) => {
        nodeRoutes(scope, container as never);
      },
      { prefix: '/node' }
    );
    await app.register(
      async (scope) => {
        videosRoutes(scope, container as never);
      },
      { prefix: '/videos' }
    );
    try {
      for (const path of ['/node', '/node/', '/node/search', '/videos', '/videos/']) {
        expect((await app.inject(path)).statusCode).toBe(404);
      }
      expect(app.hasRoute({ method: 'GET', url: '/videos/:videoId/comments/state' })).toBe(true);
      expect((await app.inject('/node/newContentCounts')).statusCode).toBe(401);
      const authorized = await app.inject({
        url: '/node/newContentCounts',
        headers: { authorization: 'Bearer admin' },
      });
      expect(authorized.json()).toMatchObject({
        isError: false,
        newContentCounts: {
          newCommentsCount: 2,
          newVideoReportsCount: 3,
          newCommentReportsCount: 4,
        },
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/node/contentChecked',
            headers: { authorization: 'Bearer admin' },
            payload: { contentType: 'comments' },
          })
        ).statusCode
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/node/contentChecked',
            headers: { authorization: 'Bearer admin' },
            payload: { contentType: 'invalid' },
          })
        ).statusCode
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});
