/**
 * Unit tests for StatusController
 *
 * Tests the status and health check endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { StatusController } from '@controllers/status.js';

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

// Mock config
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    nodeSettings: {
      nodeId: 'test-node-id',
      nodeName: 'Test Node',
      nodeAbout: 'Test node description',
      publicNodeProtocol: 'https',
      publicNodeAddress: 'test.example.com',
      publicNodePort: 443,
      cloudflareTurnstileSiteKey: 'turnstile-site-key',
    },
  }),
}));

// Create mock request/reply
function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    ...overrides,
  } as FastifyRequest;
}

function createMockReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe('StatusController', () => {
  let controller: StatusController;
  let mockVideosService: {
    countVideos: ReturnType<typeof vi.fn>;
  };
  let mockReply: FastifyReply;

  beforeEach(() => {
    mockVideosService = {
      countVideos: vi.fn(),
    };
    controller = new StatusController(mockVideosService as never);
    mockReply = createMockReply();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a StatusController instance', () => {
      expect(controller).toBeInstanceOf(StatusController);
    });
  });

  describe('information', () => {
    it('should return node status information', async () => {
      mockVideosService.countVideos.mockResolvedValue(42);
      const mockRequest = createMockRequest();

      await controller.information(mockRequest, mockReply);

      expect(mockVideosService.countVideos).toHaveBeenCalledWith({
        isPublished: true,
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        information: {
          nodeVideoCount: 42,
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: '443',
          cloudflareTurnstileSiteKey: 'turnstile-site-key',
        },
      });
    });

    it('should convert publicNodePort to string', async () => {
      mockVideosService.countVideos.mockResolvedValue(0);
      const mockRequest = createMockRequest();

      await controller.information(mockRequest, mockReply);

      const sendCall = (mockReply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(typeof sendCall.information.publicNodePort).toBe('string');
    });

    it('should return zero video count when no published videos', async () => {
      mockVideosService.countVideos.mockResolvedValue(0);
      const mockRequest = createMockRequest();

      await controller.information(mockRequest, mockReply);

      const sendCall = (mockReply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sendCall.information.nodeVideoCount).toBe(0);
    });

    it('should return error when countVideos fails', async () => {
      mockVideosService.countVideos.mockRejectedValue(new Error('Database error'));
      const mockRequest = createMockRequest();

      await controller.information(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error retrieving status information',
      });
    });
  });

  describe('heartbeat', () => {
    it('should return timestamp', async () => {
      const mockRequest = createMockRequest();
      const beforeTimestamp = Date.now();

      await controller.heartbeat(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      
      const sendCall = (mockReply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sendCall.isError).toBe(false);
      expect(sendCall.timestamp).toBeDefined();
      expect(typeof sendCall.timestamp).toBe('number');
      expect(sendCall.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    });

    it('should return isError: false', async () => {
      const mockRequest = createMockRequest();

      await controller.heartbeat(mockRequest, mockReply);

      const sendCall = (mockReply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sendCall.isError).toBe(false);
    });
  });
});
