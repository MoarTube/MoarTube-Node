import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyView from '@fastify/view';
import { validatorCompiler } from 'fastify-type-provider-zod';
import ejs from 'ejs';
import { resolve } from 'node:path';
import { baseRoutes } from '@routes/base.js';

vi.mock('@/utils/viewer-urls.js', () => ({ pageCanonicalOrigin: async () => 'https://node.test' }));
describe('Base Routes', () => {
  it.each(['/', '/?searchTerm=cats&sortTerm=new'])(
    'renders the public homepage at %s without redirecting',
    async (url) => {
      const app = Fastify();
      app.setValidatorCompiler(validatorCompiler);
      app.decorate('optionalAuthenticate', async () => {});
      await app.register(fastifyView, {
        engine: { ejs },
        root: resolve('public/views'),
        viewExt: 'ejs',
      });
      baseRoutes(app, {
        resolve: () => ({
          state: async () => ({ epoch: 'test' }),
          settings: () => ({
            nodeName: 'Test Node',
            nodeHeadline: 'Headline',
            nodeAbout: 'About',
            nodeBulletin: [],
            nodeLinks: [],
          }),
        }),
      } as never);
      try {
        const response = await app.inject(url);
        expect(response.statusCode).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.body).toContain('Test Node');
        expect(response.body).toContain('Latest comments');
        expect(response.body).toContain('home-model');
        expect(response.body).toContain('tag-rail');
        expect(response.body).not.toContain('id="video-count"');
        expect(response.headers['cache-control']).toContain('s-maxage=30');
      } finally {
        await app.close();
      }
    }
  );
});
