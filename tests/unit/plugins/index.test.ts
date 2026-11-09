import { execFile } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  container: {
    resolve: vi.fn(() => ({
      flushPendingViews: vi.fn(),
      recoverStreamCleanup: vi.fn(),
      close: vi.fn(),
    })),
  },
  db: {},
  config: {
    paths: { viewsDirectoryPath: '/views', certificatesDirectoryPath: '' },
    nodeSettings: { isSecure: false },
  },
  registerRoutes: vi.fn(),
  createAppContainer: vi.fn(),
}));
vi.mock('@config/index.js', () => ({
  getConfig: () => mocks.config,
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
  it('fails startup when secure mode has no uploaded certificate', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'moartube-missing-tls-'));
    mocks.config.paths.certificatesDirectoryPath = directory;
    mocks.config.nodeSettings.isSecure = true;
    try {
      await expect(createFastifyApp()).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      mocks.config.nodeSettings.isSecure = false;
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.env['MOARTUBE_TEST_HLS'] !== '1')(
    'serves trusted HTTPS using uploaded certificates and returns to HTTP after restart',
    async () => {
      const directory = await fs.mkdtemp(path.join(tmpdir(), 'moartube-factory-tls-'));
      const key = path.join(directory, 'private_key.pem');
      const cert = path.join(directory, 'certificate.pem');
      let app: Awaited<ReturnType<typeof createFastifyApp>> | undefined;
      try {
        await promisify(execFile)(
          process.env['MOARTUBE_OPENSSL'] ?? 'openssl',
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            key,
            '-out',
            cert,
            '-days',
            '1',
            '-subj',
            '/CN=localhost',
            '-addext',
            'subjectAltName=DNS:localhost,IP:127.0.0.1',
          ],
          { windowsHide: true, timeout: 15_000 }
        );
        mocks.config.paths.certificatesDirectoryPath = directory;
        mocks.config.nodeSettings.isSecure = true;
        mocks.createAppContainer.mockResolvedValue(mocks.container);
        mocks.registerRoutes.mockImplementation((server) =>
          server.get('/unit-tls', async () => ({ ok: true }))
        );
        app = await createFastifyApp();
        await app.listen({ host: '127.0.0.1', port: 0 });
        const url = app.listeningOrigin + '/unit-tls';
        expect(url.startsWith('https://')).toBe(true);
        const ca = await fs.readFile(cert);
        const get = (trust: boolean) =>
          new Promise<number>((resolve, reject) => {
            const request = httpsRequest(
              url,
              { ...(trust ? { ca } : {}), rejectUnauthorized: true },
              (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode!));
              }
            );
            request.on('error', reject);
            request.end();
          });
        expect(await get(true)).toBe(200);
        await expect(get(false)).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
        await app.close();
        mocks.config.nodeSettings.isSecure = false;
        app = await createFastifyApp();
        await app.listen({ host: '127.0.0.1', port: 0 });
        expect(app.listeningOrigin.startsWith('http://')).toBe(true);
        expect((await fetch(app.listeningOrigin + '/unit-tls')).status).toBe(200);
      } finally {
        await app?.close();
        mocks.config.nodeSettings.isSecure = false;
        await fs.rm(directory, { recursive: true, force: true });
      }
    },
    30_000
  );
});
