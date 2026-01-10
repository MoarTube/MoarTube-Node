/**
 * ExternalResourcesController Tests
 *
 * Tests for serving static assets (JavaScript, CSS, fonts, images).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock node:fs module
vi.mock('node:fs', () => ({
  rm: vi.fn(),
  default: {
    existsSync: vi.fn(),
    createReadStream: vi.fn(),
    statSync: vi.fn(),
    rm: vi.fn(),
  },
}));

// Mock config
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: {
      publicDirectoryPath: '/public',
      imagesDirectoryPath: '/data/images',
    },
  })),
}));

import { ExternalResourcesController } from '@controllers/external-resources.js';
import fs from 'node:fs';

describe('ExternalResourcesController', () => {
  let controller: ExternalResourcesController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    header: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ExternalResourcesController();

    mockRequest = {
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create an ExternalResourcesController instance', () => {
      expect(controller).toBeInstanceOf(ExternalResourcesController);
    });
  });

  describe('getJavaScript', () => {
    it('should return 404 when JavaScript file does not exist', async () => {
      mockRequest.params = { filename: 'app.js' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getJavaScript(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'file not found',
      });
    });

    it('should serve JavaScript file when it exists', async () => {
      mockRequest.params = { filename: 'app.js' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getJavaScript(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.existsSync).toHaveBeenCalled();
      // Verify header was called (file streaming sets headers)
      expect(mockReply.header).toHaveBeenCalled();
    });
  });

  describe('getCss', () => {
    it('should return 404 when CSS file does not exist', async () => {
      mockRequest.params = { filename: 'style.css' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getCss(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'file not found',
      });
    });

    it('should serve CSS file when it exists', async () => {
      mockRequest.params = { filename: 'style.css' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getCss(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalled();
    });
  });

  describe('getFonts', () => {
    it('should return 404 when font file does not exist', async () => {
      mockRequest.params = { filename: 'font.woff2' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve woff2 font with correct content type', async () => {
      mockRequest.params = { filename: 'font.woff2' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 200 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'font/woff2');
    });

    it('should serve ttf font with correct content type', async () => {
      mockRequest.params = { filename: 'font.ttf' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 300 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'font/ttf');
    });
  });

  describe('getImage', () => {
    it('should return 404 when image does not exist', async () => {
      mockRequest.params = { imageName: 'logo.png' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve PNG image with correct content type', async () => {
      mockRequest.params = { imageName: 'logo.png' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    it('should serve JPG image with correct content type', async () => {
      mockRequest.params = { imageName: 'photo.jpg' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });

    it('should serve SVG image with correct content type', async () => {
      mockRequest.params = { imageName: 'icon.svg' };
      // First call for custom image check, second for default
      vi.mocked(fs.existsSync).mockImplementation(() => true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 800 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/svg+xml');
    });

    it('should check for custom avatar image in data/images directory', async () => {
      mockRequest.params = { imageName: 'avatar.png' };
      // First call (custom path) returns true, so use custom path
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // First existsSync call checks custom path
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should check for custom icon.png image in data/images directory', async () => {
      mockRequest.params = { imageName: 'icon.png' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    it('should check for custom banner.png image in data/images directory', async () => {
      mockRequest.params = { imageName: 'banner.png' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    it('should fall back to default path when custom icon does not exist', async () => {
      mockRequest.params = { imageName: 'icon.png' };
      // First call (custom path) returns false, second (default) returns true
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)  // custom path check
        .mockReturnValueOnce(true);  // default path check in serveStaticFile
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // existsSync is called at least twice (custom path check + serveStaticFile)
      expect(fs.existsSync).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    it('should serve JPEG image with correct content type', async () => {
      mockRequest.params = { imageName: 'photo.jpeg' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });

    it('should serve GIF image with correct content type', async () => {
      mockRequest.params = { imageName: 'animation.gif' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 3000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/gif');
    });

    it('should serve WEBP image with correct content type', async () => {
      mockRequest.params = { imageName: 'photo.webp' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/webp');
    });

    it('should serve ICO file with correct content type', async () => {
      mockRequest.params = { imageName: 'favicon.ico' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/x-icon');
    });

    it('should serve unknown image type with octet-stream content type', async () => {
      mockRequest.params = { imageName: 'file.unknown' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('should handle error when serving image', async () => {
      mockRequest.params = { imageName: 'logo.png' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getImage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error serving image file',
      });
    });
  });

  describe('getFonts - additional types', () => {
    it('should serve woff font with correct content type', async () => {
      mockRequest.params = { filename: 'font.woff' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 200 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'font/woff');
    });

    it('should serve otf font with correct content type', async () => {
      mockRequest.params = { filename: 'font.otf' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 300 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'font/otf');
    });

    it('should serve eot font with correct content type', async () => {
      mockRequest.params = { filename: 'font.eot' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 300 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/vnd.ms-fontobject');
    });

    it('should serve unknown font type with octet-stream content type', async () => {
      mockRequest.params = { filename: 'font.xyz' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 300 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('should handle error when serving font', async () => {
      mockRequest.params = { filename: 'font.woff2' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getFonts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error serving font file',
      });
    });
  });

  describe('getJavaScript - error handling', () => {
    it('should handle error when serving JavaScript file', async () => {
      mockRequest.params = { filename: 'app.js' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getJavaScript(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error serving JavaScript file',
      });
    });
  });

  describe('getCss - error handling', () => {
    it('should handle error when serving CSS file', async () => {
      mockRequest.params = { filename: 'style.css' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getCss(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error serving CSS file',
      });
    });
  });
});

