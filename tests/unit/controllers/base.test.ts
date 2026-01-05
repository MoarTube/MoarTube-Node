/**
 * Unit tests for BaseController
 *
 * Tests the abstract base controller class that provides common functionality
 * for all controllers including response formatting and file serving.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyReply } from 'fastify';
import fs from 'node:fs';
import { Readable } from 'node:stream';

import { BaseController } from '@controllers/base.js';

// Mock the logger
vi.mock('@utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
  },
}));

/**
 * Concrete implementation of BaseController for testing
 */
class TestController extends BaseController {
  constructor() {
    super('TestController');
  }

  // Expose protected methods for testing
  public testSendSuccess(reply: FastifyReply, data?: object, status?: number) {
    return this.sendSuccess(reply, data, status);
  }

  public testSendError(reply: FastifyReply, message: string, status?: number) {
    return this.sendError(reply, message, status);
  }

  public testSendFile(reply: FastifyReply, filePath: string, contentType: string) {
    return this.sendFile(reply, filePath, contentType);
  }

  public testSendChunk(
    reply: FastifyReply,
    filePath: string,
    start: number,
    end: number,
    fileSize: number,
    chunkSize: number,
    contentType: string
  ) {
    return this.sendChunk(reply, filePath, start, end, fileSize, chunkSize, contentType);
  }

  public getControllerName() {
    return this.controllerName;
  }

  public getLogger() {
    return this.logger;
  }
}

/**
 * Create a mock FastifyReply object
 */
function createMockReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe('BaseController', () => {
  let controller: TestController;
  let mockReply: FastifyReply;

  beforeEach(() => {
    controller = new TestController();
    mockReply = createMockReply();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set controller name', () => {
      expect(controller.getControllerName()).toBe('TestController');
    });

    it('should initialize logger instance', () => {
      expect(controller.getLogger()).toBeDefined();
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with data', () => {
      const data = { id: 1, name: 'test' };

      controller.testSendSuccess(mockReply, data);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        id: 1,
        name: 'test',
      });
    });

    it('should send success response without data', () => {
      controller.testSendSuccess(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ isError: false });
    });

    it('should send success response with custom status code', () => {
      controller.testSendSuccess(mockReply, { created: true }, 201);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        created: true,
      });
    });

    it('should spread data properties into response', () => {
      const data = { 
        videoId: 'abc123',
        title: 'Test Video',
        views: 100,
      };

      controller.testSendSuccess(mockReply, data);

      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        videoId: 'abc123',
        title: 'Test Video',
        views: 100,
      });
    });

    it('should handle empty object data', () => {
      controller.testSendSuccess(mockReply, {});

      expect(mockReply.send).toHaveBeenCalledWith({ isError: false });
    });

    it('should handle nested object data', () => {
      const data = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      controller.testSendSuccess(mockReply, data);

      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      });
    });

    it('should handle array data', () => {
      const data = { items: [1, 2, 3] };

      controller.testSendSuccess(mockReply, data);

      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        items: [1, 2, 3],
      });
    });
  });

  describe('sendError', () => {
    it('should send error response with message', () => {
      controller.testSendError(mockReply, 'Something went wrong');

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'Something went wrong',
      });
    });

    it('should send error response with custom status code', () => {
      controller.testSendError(mockReply, 'Not found', 404);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'Not found',
      });
    });

    it('should send 500 error', () => {
      controller.testSendError(mockReply, 'Internal server error', 500);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'Internal server error',
      });
    });

    it('should send 401 unauthorized error', () => {
      controller.testSendError(mockReply, 'Unauthorized', 401);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should send 403 forbidden error', () => {
      controller.testSendError(mockReply, 'Access denied', 403);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('sendFile', () => {
    it('should send file when it exists', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats);
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      controller.testSendFile(mockReply, '/path/to/file.jpg', 'image/jpeg');

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/file.jpg');
      expect(fs.statSync).toHaveBeenCalledWith('/path/to/file.jpg');
      expect(fs.createReadStream).toHaveBeenCalledWith('/path/to/file.jpg');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Length', 1024);
      expect(mockReply.send).toHaveBeenCalledWith(mockStream);
    });

    it('should return 404 error when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      controller.testSendFile(mockReply, '/path/to/missing.jpg', 'image/jpeg');

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'file not found',
      });
    });

    it('should set correct content type for video', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 5000000 } as fs.Stats);
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      controller.testSendFile(mockReply, '/path/to/video.mp4', 'video/mp4');

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/mp4');
    });

    it('should set correct content type for JSON', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 256 } as fs.Stats);
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      controller.testSendFile(mockReply, '/path/to/data.json', 'application/json');

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
  });

  describe('sendChunk', () => {
    it('should send partial content with correct headers', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      const start = 0;
      const end = 999;
      const fileSize = 5000;
      const chunkSize = 1000;

      controller.testSendChunk(
        mockReply,
        '/path/to/video.mp4',
        start,
        end,
        fileSize,
        chunkSize,
        'video/mp4'
      );

      expect(mockReply.status).toHaveBeenCalledWith(206);
      expect(mockReply.header).toHaveBeenCalledWith('Content-Range', 'bytes 0-999/5000');
      expect(mockReply.header).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Length', 1000);
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      expect(mockReply.send).toHaveBeenCalledWith(mockStream);
    });

    it('should create read stream with correct range options', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      controller.testSendChunk(
        mockReply,
        '/path/to/video.mp4',
        1000,
        1999,
        5000,
        1000,
        'video/mp4'
      );

      expect(fs.createReadStream).toHaveBeenCalledWith('/path/to/video.mp4', {
        start: 1000,
        end: 1999,
      });
    });

    it('should handle last chunk correctly', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      const start = 4000;
      const end = 4999;
      const fileSize = 5000;
      const chunkSize = 1000;

      controller.testSendChunk(
        mockReply,
        '/path/to/video.mp4',
        start,
        end,
        fileSize,
        chunkSize,
        'video/mp4'
      );

      expect(mockReply.header).toHaveBeenCalledWith('Content-Range', 'bytes 4000-4999/5000');
    });

    it('should handle different content types', () => {
      const mockStream = new Readable({ read() {} });
      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as fs.ReadStream);

      controller.testSendChunk(
        mockReply,
        '/path/to/video.webm',
        0,
        999,
        5000,
        1000,
        'video/webm'
      );

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'video/webm');
    });
  });

  describe('controller naming', () => {
    it('should support different controller names', () => {
      class VideosTestController extends BaseController {
        constructor() {
          super('VideosController');
        }
        getName() {
          return this.controllerName;
        }
      }

      const videosController = new VideosTestController();
      expect(videosController.getName()).toBe('VideosController');
    });

    it('should support empty controller name', () => {
      class EmptyNameController extends BaseController {
        constructor() {
          super('');
        }
        getName() {
          return this.controllerName;
        }
      }

      const emptyController = new EmptyNameController();
      expect(emptyController.getName()).toBe('');
    });
  });
});
