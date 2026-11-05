import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import view from '@fastify/view';
import ejs from 'ejs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import errorHandler from '@/plugins/error-handler.js';
import { NodeController } from '@/controllers/node.js';
import { WatchController } from '@/controllers/watch.js';

vi.mock('@config/index.js', () => ({
  getConfig: () => ({
    nodeSettings: { publicNodeProtocol: 'https', publicNodeAddress: 'node.example.com', publicNodePort: '443', storageConfig: { storageMode: 'filesystem' } },
    getExternalVideosBaseUrl: () => 'https://media.example.com',
    getExternalResourcesBaseUrl: () => 'https://node.example.com',
  }),
}));

describe('CDN HTML rendering failure cache policy', () => {
  it.each(['node', 'watch'] as const)(
    'keeps %s rendering failures uncached and successful anonymous responses cacheable',
    async (page) => {
      const videos = {
        countVideos: async () => 1,
        getVideos: async () => ({ data: [] }),
        getPublishedTags: async () => [],
        getRecommendedVideos: async () => [],
        getVideo: async () => ({
          video_id: 'abcdefghijk',
          outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] }),
          comments: 0,
        }),
      };
      const links = { getAllLinks: async () => [] };
      const wallets = { getWalletAddresses: async () => [] };
      const handler =
        page === 'node'
          ? new NodeController(
              videos as never,
              links as never,
              wallets as never,
              {} as never,
              {} as never,
              {} as never
            ).getNodePage
          : new WatchController(
              videos as never,
              links as never,
              wallets as never,
              { getCacheVersion: async () => 1, getCacheEpoch: async () => 'epoch' } as never
            ).getWatchPage;
      const app = Fastify();
      const directory = await mkdtemp(path.join(tmpdir(), 'moartube-html-errors-'));
      const template = path.join(directory, page + '.ejs');
      await writeFile(template, '<% throw new Error("Template failed") %>');
      await app.register(view, { engine: { ejs }, root: directory, production: false });
      await app.register(errorHandler);
      app.get('/', handler);
      try {
        const failed = await app.inject('/?v=abcdefghijk');
        expect(failed.statusCode).toBe(500);
        expect(failed.headers['cache-control']).toBe('no-store');
        await writeFile(template, '<html>ok</html>');
        const success = await app.inject('/?v=abcdefghijk');
        expect(success.statusCode).toBe(200);
        expect(success.headers['cache-control']).toContain('s-maxage=30');
        const authenticated = await app.inject({
          url: '/?v=abcdefghijk',
          headers: { authorization: 'Bearer test' },
        });
        expect(authenticated.statusCode).toBe(200);
        expect(authenticated.headers['cache-control']).toBe('no-store');
      } finally {
        await app.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
});
