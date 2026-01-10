/**
 * ExternalVideosController Tests
 *
 * Tests for serving video content.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock node:fs module
vi.mock('node:fs', () => ({
  rm: vi.fn(),
  default: {
    existsSync: vi.fn(),
    createReadStream: vi.fn(),
    statSync: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
  },
}));

// Mock config
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: {
      videosDirectoryPath: '/data/media/videos',
    },
    getExternalVideosBaseUrl: vi.fn(() => 'https://example.com'),
  })),
}));

import { ExternalVideosController } from '@controllers/external-videos.js';
import fs from 'node:fs';

// Mock services
const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
  getVideo: vi.fn(),
  incrementViews: vi.fn(),
  updateBandwidth: vi.fn(),
};

describe('ExternalVideosController', () => {
  let controller: ExternalVideosController;
  let mockRequest: Partial<FastifyRequest> & { headers?: Record<string, string> };
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    header: Mock;
    type: Mock;
    raw: { write: Mock; end: Mock };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    controller = new ExternalVideosController(mockVideosService as any);

    mockRequest = {
      params: {},
      headers: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      raw: { write: vi.fn(), end: vi.fn() },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create an ExternalVideosController instance', () => {
      expect(controller).toBeInstanceOf(ExternalVideosController);
    });
  });

  describe('getBaseUrl', () => {
    it('should return external videos base URL', async () => {
      await controller.getBaseUrl(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        externalVideosBaseUrl: 'https://example.com',
      });
    });

    it('should return 400 error when getBaseUrl throws', async () => {
      // Mock getConfig to throw to trigger the catch block
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.getBaseUrl(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('getThumbnail', () => {
    it('should return 404 when thumbnail does not exist', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getThumbnail(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'thumbnail not found',
      });
    });

    it('should serve thumbnail when it exists', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 5000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getThumbnail(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });
  });

  describe('getPreview', () => {
    it('should return 404 when preview does not exist', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getPreview(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve preview when it exists', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 8000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getPreview(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });
  });

  describe('getPoster', () => {
    it('should return 404 when poster does not exist', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getPoster(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve poster when it exists', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 10000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getPoster(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });
  });

  // ===============================
  // Adaptive Manifest Tests
  // ===============================
  describe('getAdaptiveManifest', () => {
    it('should return 404 when manifest does not exist', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        type: 'hls',
        manifestName: 'master.m3u8',
      };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getAdaptiveManifest(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve manifest when it exists', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        type: 'hls',
        manifestName: 'master.m3u8',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getAdaptiveManifest(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/vnd.apple.mpegurl');
    });

    it('should return 500 on error', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        type: 'hls',
        manifestName: 'master.m3u8',
      };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      await controller.getAdaptiveManifest(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ===============================
  // Adaptive Segment Tests
  // ===============================
  describe('getAdaptiveSegment', () => {
    it('should return 404 when segment does not exist', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
        segmentName: 'segment0.ts',
      };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve segment when it exists', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
        segmentName: 'segment0.ts',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 50000 } as any);
      // Mock fs.stat for bandwidth tracking
      vi.mocked(fs.stat).mockImplementation((_path, callback) => {
        (callback as (err: Error | null, stats: { size: number }) => void)(null, { size: 50000 });
        return undefined as any;
      });
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/mp2t');

      // Trigger the debounced bandwidth update
      vi.advanceTimersByTime(100);
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledWith('video123', 50000);
    });

    it('should return 500 on error', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
        segmentName: 'segment0.ts',
      };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle fs.stat error gracefully', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
        segmentName: 'segment0.ts',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 50000 } as any);
      // Mock fs.stat to return error
      vi.mocked(fs.stat).mockImplementation((_path, callback) => {
        (callback as (err: Error | null, stats: null) => void)(new Error('Stat error'), null);
        return undefined as any;
      });
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Should still serve the segment
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/mp2t');

      // Bandwidth should not be updated due to stat error
      vi.advanceTimersByTime(100);
      expect(mockVideosService.updateBandwidth).not.toHaveBeenCalled();
    });
  });

  // ===============================
  // Progressive Download Tests
  // ===============================
  describe('getProgressive', () => {
    it('should return 404 when progressive file does not exist', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should serve progressive file without range request', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      mockRequest.headers = {};
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/mp4');
    });

    it('should handle range request', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      mockRequest.headers = { range: 'bytes=0-999999' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Should set 206 status for partial content
      expect(mockReply.status).toHaveBeenCalledWith(206);

      // Trigger bandwidth update
      vi.advanceTimersByTime(100);
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledWith('video123', 1000000);
    });

    it('should handle range request without end byte', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      mockRequest.headers = { range: 'bytes=500000-' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(206);
    });

    it('should handle range request without start byte', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      mockRequest.headers = { range: 'bytes=-500000' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(206);
    });

    it('should return 500 on error', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ===============================
  // Error Handling
  // ===============================
  describe('error handling', () => {
    it('should return 500 when getThumbnail throws', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getThumbnail(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when getPreview throws', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getPreview(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when getPoster throws', async () => {
      mockRequest.params = { videoId: 'video123' };
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('FS error');
      });

      await controller.getPoster(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ===============================
  // Bandwidth Tracking
  // ===============================
  describe('bandwidth tracking', () => {
    it('should debounce segment bandwidth updates', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
        segmentName: 'segment0.ts',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 50000 } as any);
      vi.mocked(fs.stat).mockImplementation((_path, callback) => {
        (callback as (err: Error | null, stats: { size: number }) => void)(null, { size: 25000 });
        return undefined as any;
      });
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      // First request
      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Second request before timer fires (debouncing)
      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Third request
      await controller.getAdaptiveSegment(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Advance timers to trigger debounced callback
      vi.advanceTimersByTime(100);

      // Should only have one call with accumulated bandwidth (3 * 25000)
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledTimes(1);
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledWith('video123', 75000);
    });

    it('should debounce progressive bandwidth updates', async () => {
      mockRequest.params = {
        videoId: 'video123',
        format: 'mp4',
        progressiveFilename: 'video.mp4',
      };
      mockRequest.headers = { range: 'bytes=0-99999' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 2000000 } as any);
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

      // First request
      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Second request
      await controller.getProgressive(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      vi.advanceTimersByTime(100);

      // Should only call once with accumulated bandwidth
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledTimes(1);
      // 2 requests of 100000 bytes each
      expect(mockVideosService.updateBandwidth).toHaveBeenCalledWith('video123', 200000);
    });
  });
});
