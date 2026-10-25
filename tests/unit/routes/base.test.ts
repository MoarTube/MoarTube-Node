/** Tests for the node home page. */
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import { resolve } from 'node:path';
import { baseRoutes } from '@routes/base.js';

describe('Base Routes', () => {
  it.each(['/', '/?searchTerm=cats&sortTerm=latest'])(
    'should render a blank index page at %s without redirecting',
    async (url) => {
      const app = Fastify();
      app.register(fastifyView, {
        engine: { ejs },
        root: resolve('public/views'),
        viewExt: 'ejs',
      });
      baseRoutes(app);

      try {
        const response = await app.inject(url);
        expect(response.statusCode).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.body).toContain('<title>Index</title>');
        expect(response.body).toMatch(/<body>\s*<\/body>/);
      } finally {
        await app.close();
      }
    }
  );
});
