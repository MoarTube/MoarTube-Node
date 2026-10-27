import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  container: { resolve: vi.fn(() => ({ flushPendingViews: vi.fn() })) },
  db: {},
  registerRoutes: vi.fn(),
  createAppContainer: vi.fn(),
}));
vi.mock('@config/index.js', () => ({
  getConfig: () => ({ paths: { viewsDirectoryPath: '/views' } }),
}));
vi.mock('@core/index.js', () => ({ createAppContainer: mocks.createAppContainer }));
vi.mock('@database/index.js', () => ({ getDatabase: () => mocks.db }));
vi.mock('@routes/index.js', () => ({ registerRoutes: mocks.registerRoutes }));
vi.mock('@plugins/authentication.js', () => ({ default: async () => {} }));
vi.mock('@plugins/swagger.js', () => ({ default: async () => {} }));
vi.mock('@plugins/error-handler.js', () => ({ default: async () => {} }));
import { createFastifyApp } from '@plugins/index.js';

describe('createFastifyApp', () => {
  it('creates a ready Fastify app with CORS, validation, views, and container routes', async () => {
    mocks.createAppContainer.mockResolvedValue(mocks.container);
    mocks.registerRoutes.mockImplementation((app) => {
      app.get('/unit-health', async () => ({ ok: true }));
    });
    const app = await createFastifyApp();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/unit-health',
        headers: { origin: 'https://example.test' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(response.headers['access-control-allow-origin']).toBe('https://example.test');
      expect(app.hasDecorator('view')).toBe(true);
      expect(mocks.createAppContainer).toHaveBeenCalledWith(mocks.db);
      expect(mocks.registerRoutes).toHaveBeenCalledOnce();
      expect(mocks.registerRoutes.mock.calls[0][0]).toBe(app);
      expect(mocks.registerRoutes.mock.calls[0][1]).toBe(mocks.container);
    } finally {
      await app.close();
    }
  });
});
