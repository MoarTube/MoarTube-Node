/**
 * Chat Join Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatJoinHandler } from '@websocket/handlers/chat-join.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/websocket.js';
import type { VideosService } from '@services/videos.js';

describe('ChatJoinHandler', () => {
  let handler: ChatJoinHandler;
  let mockClient: ExtendedWebSocket;
  let mockContext: HandlerContext;
  let mockVideosService: {
    getVideo: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockVideosService = {
      getVideo: vi.fn().mockResolvedValue({ id: 'testvideo01', title: 'Test Video' }),
    };

    handler = new ChatJoinHandler(mockVideosService as unknown as VideosService);
    
    mockClient = {
      clientId: 'client_1',
      socketType: 'viewer',
      isAuthenticated: false,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      videoId: undefined,
      liveChatUsername: undefined,
      liveChatUsernameColorCode: undefined,
      rateLimiter: undefined,
    } as unknown as ExtendedWebSocket;

    mockContext = {
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      getClients: vi.fn().mockReturnValue(new Set([mockClient])),
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as HandlerContext;
  });

  describe('name property', () => {
    it('should have correct name', () => {
      expect(handler.name).toBe('ChatJoinHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for chat join event', () => {
      expect(handler.canHandle({ eventName: 'chat', type: 'join' })).toBe(true);
    });

    it('should return false for chat message event', () => {
      expect(handler.canHandle({ eventName: 'chat', type: 'message' })).toBe(false);
    });

    it('should return false for non-chat events', () => {
      expect(handler.canHandle({ eventName: 'register' })).toBe(false);
      expect(handler.canHandle({ eventName: 'echo' })).toBe(false);
    });

    it('should return false for chat without type', () => {
      expect(handler.canHandle({ eventName: 'chat' })).toBe(false);
    });
  });

  describe('handle - successful join', () => {
    it('should allow client to join chat for existing video', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('testvideo01');
      expect(mockClient.videoId).toBe('testvideo01');
      expect(mockClient.liveChatUsername).toBeDefined();
      expect(mockClient.liveChatUsername?.length).toBe(8);
      expect(mockClient.liveChatUsernameColorCode).toBeDefined();
      expect(mockClient.liveChatUsernameColorCode?.length).toBe(6);
    });

    it('should initialize rate limiter on client', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockClient.rateLimiter).toEqual({
        timestamps: [],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      });
    });

    it('should send joined response with username and color', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'joined',
        liveChatUsername: expect.any(String),
        liveChatUsernameColorCode: expect.any(String),
      });
    });

    it('should log client joined chat', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Client joined chat', {
        clientId: 'client_1',
        videoId: 'testvideo01',
        username: expect.any(String),
      });
    });
  });

  describe('handle - video not found', () => {
    it('should send error and close connection if video does not exist', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);
      const message = { eventName: 'chat', type: 'join', videoId: 'nonexistent' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'join',
        message: 'this video no longer exists',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should not set client properties if video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);
      const message = { eventName: 'chat', type: 'join', videoId: 'nonexistent' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockClient.videoId).toBeUndefined();
      expect(mockClient.liveChatUsername).toBeUndefined();
    });
  });

  describe('handle - validation errors', () => {
    it('should send error and close on invalid message format', async () => {
      const message = { eventName: 'chat', type: 'join' }; // Missing videoId

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid chat join event format',
        expect.objectContaining({
          clientId: 'client_1',
        })
      );
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'join',
        message: 'invalid join format',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle invalid videoId type', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 123 };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('username generation', () => {
    it('should generate 8 character alphanumeric username', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockClient.liveChatUsername).toMatch(/^[0-9a-zA-Z]{8}$/);
    });

    it('should generate different usernames for different clients', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };
      const mockClient2 = {
        ...mockClient,
        clientId: 'client_2',
        liveChatUsername: undefined,
        liveChatUsernameColorCode: undefined,
      } as unknown as ExtendedWebSocket;

      await handler.handle(mockClient, message, mockContext);
      const username1 = mockClient.liveChatUsername;

      await handler.handle(mockClient2, message, mockContext);
      const username2 = mockClient2.liveChatUsername;

      // Very unlikely to be the same
      // Note: This test could theoretically fail, but probability is astronomically low
      expect(username1).not.toBe(username2);
    });
  });

  describe('color generation', () => {
    it('should generate 6 character hex color code', async () => {
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      await handler.handle(mockClient, message, mockContext);

      expect(mockClient.liveChatUsernameColorCode).toMatch(/^[0-9a-f]{6}$/i);
    });
  });

  describe('service errors', () => {
    it('should handle video service errors gracefully', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));
      const message = { eventName: 'chat', type: 'join', videoId: 'testvideo01' };

      // Handler catches errors internally and logs them
      await handler.handle(mockClient, message, mockContext);
      
      // Error is caught and client receives error message
      expect(mockContext.log.warn).toHaveBeenCalled();
      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
