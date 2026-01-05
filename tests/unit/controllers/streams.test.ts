/**
 * Unit tests for StreamsController
 *
 * Tests live streaming endpoints including stream start/stop,
 * segment management, bandwidth, and chat functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify';

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
const mockPaths = {
  videosDirectoryPath: '/mock/videos',
};

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: mockPaths,
    nodeSettings: {},
  })),
}));

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import fs from 'node:fs';
import { StreamsController } from '@controllers/streams.js';

// Create mock request/reply helpers
function createMockRequest(
  overrides: Partial<FastifyRequest> = {}
): FastifyRequest {
  return {
    body: {},
    params: {},
    query: {},
    isAuthenticated: false,
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as FastifyBaseLogger,
    ...overrides,
  } as unknown as FastifyRequest;
}

function createMockReply(): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

describe('StreamsController', () => {
  let controller: StreamsController;
  let mockVideosService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLiveChatService: Record<string, ReturnType<typeof vi.fn>>;
  let mockStreamService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReply: FastifyReply;

  beforeEach(() => {
    mockVideosService = {
      getVideo: vi.fn(),
      updateVideoMeta: vi.fn(),
    };

    mockLiveChatService = {
      deleteMessagesForVideo: vi.fn(),
      pruneOldMessages: vi.fn(),
      getRecentMessages: vi.fn(),
    };

    mockStreamService = {
      startNewStream: vi.fn(),
      stopStream: vi.fn(),
    };

    controller = new StreamsController(
      mockVideosService as never,
      mockLiveChatService as never,
      mockStreamService as never
    );

    mockReply = createMockReply();

    // Reset fs mocks
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a StreamsController instance', () => {
      expect(controller).toBeInstanceOf(StreamsController);
    });
  });

  // ==================
  // Start Stream Tests
  // ==================
  describe('startStream', () => {
    it('should start a new stream', async () => {
      mockStreamService.startNewStream.mockResolvedValue({ videoId: 'vid-123' });

      const mockRequest = createMockRequest({
        body: {
          title: 'Live Stream',
          description: 'My live stream',
          tags: 'gaming,live',
          rtmpPort: 1935,
          uuid: 'uuid-123',
          isRecordingStreamRemotely: false,
          isRecordingStreamLocally: true,
          networkAddress: '192.168.1.100',
          resolution: '1080p',
        },
      });

      await controller.startStream(mockRequest, mockReply);

      expect(mockStreamService.startNewStream).toHaveBeenCalledWith({
        title: 'Live Stream',
        description: 'My live stream',
        tags: 'gaming,live',
        rtmpPort: 1935,
        isRecordingStreamRemotely: false,
        isRecordingStreamLocally: true,
        networkAddress: '192.168.1.100',
        resolution: '1080p',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        videoId: 'vid-123',
      });
    });

    it('should resume an existing stream with videoId', async () => {
      mockStreamService.startNewStream.mockResolvedValue({ videoId: 'existing-vid' });

      const mockRequest = createMockRequest({
        body: {
          title: 'Resumed Stream',
          description: 'Resuming stream',
          tags: 'live',
          rtmpPort: 1935,
          uuid: 'uuid-456',
          isRecordingStreamRemotely: false,
          isRecordingStreamLocally: false,
          networkAddress: '192.168.1.100',
          resolution: '720p',
          videoId: 'existing-vid',
        },
      });

      await controller.startStream(mockRequest, mockReply);

      expect(mockStreamService.startNewStream).toHaveBeenCalledWith(
        expect.objectContaining({
          existingVideoId: 'existing-vid',
        })
      );
    });

    it('should return 500 on error', async () => {
      mockStreamService.startNewStream.mockRejectedValue(new Error('Stream error'));

      const mockRequest = createMockRequest({
        body: {
          title: 'Stream',
          description: '',
          tags: '',
          rtmpPort: 1935,
          uuid: 'uuid',
          isRecordingStreamRemotely: false,
          isRecordingStreamLocally: false,
          networkAddress: '127.0.0.1',
          resolution: '480p',
        },
      });

      await controller.startStream(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  // =================
  // Stop Stream Tests
  // =================
  describe('stopStream', () => {
    it('should stop a stream', async () => {
      mockStreamService.stopStream.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.stopStream(mockRequest, mockReply);

      expect(mockStreamService.stopStream).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockStreamService.stopStream.mockRejectedValue(new Error('Stop error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.stopStream(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // ====================
  // Remove Segment Tests
  // ====================
  describe('removeSegment', () => {
    it('should remove a segment file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      const mockRequest = createMockRequest({
        params: {
          videoId: 'vid-123',
          format: 'm3u8',
          resolution: '1080p',
        },
        body: {
          segmentName: 'segment_00001.ts',
        },
      });

      await controller.removeSegment(mockRequest, mockReply);

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should succeed even if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockRequest = createMockRequest({
        params: {
          videoId: 'vid-123',
          format: 'm3u8',
          resolution: '720p',
        },
        body: {
          segmentName: 'segment_00002.ts',
        },
      });

      await controller.removeSegment(mockRequest, mockReply);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should succeed even if deletion throws', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const mockRequest = createMockRequest({
        params: {
          videoId: 'vid-123',
          format: 'm3u8',
          resolution: '480p',
        },
        body: {
          segmentName: 'segment_00003.ts',
        },
      });

      await controller.removeSegment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when outer try block throws', async () => {
      // Make mockReply.status throw on first call to trigger outer catch
      let callCount = 0;
      (mockReply.status as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Reply error');
        }
        return mockReply;
      });

      const mockRequest = createMockRequest({
        params: {
          videoId: 'vid-123',
          format: 'm3u8',
          resolution: '480p',
        },
        body: {
          segmentName: 'segment_00003.ts',
        },
      });

      await controller.removeSegment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  // ==================
  // Get Bandwidth Tests
  // ==================
  describe('getBandwidth', () => {
    it('should get stream bandwidth', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        bandwidth: 5000000,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getBandwidth(mockRequest, mockReply);

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        bandwidth: 5000000,
      });
    });

    it('should return error when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'nonexistent' },
      });

      await controller.getBandwidth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'that video does not exist',
      });
    });

    it('should return 500 on service error', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('DB error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getBandwidth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // =======================
  // Chat Settings Tests
  // =======================
  describe('updateChatSettings', () => {
    it('should update chat settings', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: '',
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockVideosService.updateVideoMeta).toHaveBeenCalledWith('vid-123', {
        chatSettings: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should merge with existing meta', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: JSON.stringify({ existingKey: 'value' }),
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 50,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockVideosService.updateVideoMeta).toHaveBeenCalledWith('vid-123', {
        existingKey: 'value',
        chatSettings: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 50,
        },
      });
    });

    it('should delete chat history when disabled', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: '',
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);
      mockLiveChatService.deleteMessagesForVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: false,
          chatHistoryLimit: 0,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockLiveChatService.deleteMessagesForVideo).toHaveBeenCalledWith('vid-123');
    });

    it('should prune old messages when limit set', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: '',
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);
      mockLiveChatService.pruneOldMessages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 50,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockLiveChatService.pruneOldMessages).toHaveBeenCalledWith('vid-123', 50);
    });

    it('should not prune messages when limit is zero (unlimited)', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: '',
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 0, // Unlimited - no pruning
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      // Neither delete nor prune should be called
      expect(mockLiveChatService.deleteMessagesForVideo).not.toHaveBeenCalled();
      expect(mockLiveChatService.pruneOldMessages).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'nonexistent' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'that video does not exist',
      });
    });

    it('should handle invalid JSON in meta field gracefully', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        meta: 'invalid json {{{',
      });
      mockVideosService.updateVideoMeta.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      // Should still succeed, creating new meta object
      expect(mockVideosService.updateVideoMeta).toHaveBeenCalledWith('vid-123', {
        chatSettings: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on service error', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 100,
        },
      });

      await controller.updateChatSettings(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  // ====================
  // Chat History Tests
  // ====================
  describe('getChatHistory', () => {
    it('should get chat history', async () => {
      const mockHistory = [
        { id: 1, message: 'Hello', timestamp: 123456 },
        { id: 2, message: 'World', timestamp: 123457 },
      ];
      mockLiveChatService.getRecentMessages.mockResolvedValue(mockHistory);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getChatHistory(mockRequest, mockReply);

      expect(mockLiveChatService.getRecentMessages).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        chatHistory: mockHistory,
      });
    });

    it('should return empty array when no history', async () => {
      mockLiveChatService.getRecentMessages.mockResolvedValue([]);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getChatHistory(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        chatHistory: [],
      });
    });

    it('should return 500 on service error', async () => {
      mockLiveChatService.getRecentMessages.mockRejectedValue(new Error('DB error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getChatHistory(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});
