import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { linksRoutes } from '@/routes/links.js';
it('keeps public icon reads and retires database mutation endpoints', async () => {
  const app = Fastify();
  app.decorate('optionalAuthenticate', (_request: unknown, _reply: unknown, done: () => void) => done());
  const service = { getAllLinks: vi.fn(async () => []) };
  linksRoutes(app as never, { resolve: () => service } as never);
  try {
    expect((await app.inject('/all')).json()).toEqual({ isError: false, links: [] });
    for (const url of ['/add', '/delete']) {
      expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
    }
  } finally { await app.close(); }
});
