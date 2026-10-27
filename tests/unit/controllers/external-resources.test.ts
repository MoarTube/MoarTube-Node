import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
vi.mock('@/utils/public-file.js', () => ({
  servePublicFile: vi.fn(async (_request, reply) => reply),
}));
import { servePublicFile } from '@/utils/public-file.js';
const request = (params: object) => ({ params, headers: {} }) as FastifyRequest;
const reply = () =>
  ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }) as unknown as FastifyReply;

vi.mock('@config/index.js', () => ({
  getConfig: () => ({ paths: { publicDirectoryPath: '/public', imagesDirectoryPath: '/custom' } }),
}));
vi.mock('node:fs', () => ({ rm: vi.fn(), default: { existsSync: vi.fn(), rm: vi.fn() } }));
import fs from 'node:fs';
import { ExternalResourcesController } from '@controllers/external-resources.js';
describe('public resource delegation', () => {
  let controller: ExternalResourcesController;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(servePublicFile).mockImplementation(async (_req, res) => res);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    controller = new ExternalResourcesController();
  });
  it.each([
    ['getJavaScript', 'javascript', 'app.js', 'application/javascript'],
    ['getCss', 'css', 'app.css', 'text/css'],
    ...Object.entries({
      woff2: 'font/woff2',
      woff: 'font/woff',
      ttf: 'font/ttf',
      otf: 'font/otf',
      eot: 'application/vnd.ms-fontobject',
      bin: 'application/octet-stream',
    }).map(([ext, type]) => ['getFonts', 'fonts', `font.${ext}`, type]),
  ])('serves %s %s %s', async (method, folder, filename, type) => {
    const req = request({ filename }),
      res = reply();
    await (controller as any)[method](req, res);
    expect(servePublicFile).toHaveBeenCalledWith(req, res, '/public', [folder, filename], type);
  });
  it.each(
    Object.entries({
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      ico: 'image/x-icon',
      bin: 'application/octet-stream',
    })
  )('serves image %s', async (ext, type) => {
    const imageName = `image.${ext}`,
      req = request({ imageName }),
      res = reply();
    await controller.getImage(req, res);
    expect(servePublicFile).toHaveBeenCalledWith(req, res, '/public', ['images', imageName], type);
  });
  it.each(['icon.png', 'avatar.png', 'banner.png'])(
    'uses custom %s when present',
    async (imageName) => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const req = request({ imageName }),
        res = reply();
      await controller.getImage(req, res);
      expect(servePublicFile).toHaveBeenCalledWith(req, res, '/custom', [imageName], 'image/png');
    }
  );
  it('falls back to the default node image', async () => {
    const req = request({ imageName: 'icon.png' }),
      res = reply();
    await controller.getImage(req, res);
    expect(servePublicFile).toHaveBeenCalledWith(
      req,
      res,
      '/public',
      ['images', 'icon.png'],
      'image/png'
    );
  });
  it.each(['getJavaScript', 'getCss', 'getFonts', 'getImage'])(
    'handles unexpected %s errors',
    async (method) => {
      vi.mocked(servePublicFile).mockRejectedValue(new Error('disk'));
      const res = reply();
      await (controller as any)[method](request({ filename: 'x', imageName: 'x' }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    }
  );
});
