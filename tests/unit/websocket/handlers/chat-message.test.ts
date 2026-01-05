/**
 * Chat Message Handler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatMessageHandler } from '@websocket/handlers/chat-message.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/websocket.js';
import type { VideosService } from '@services/videos.js';
import type { LiveChatService } from '@services/live-chat.js';
import type { CloudflareService } from '@services/cloudflare.js';
import { getConfig } from '@config/index.js';

// Mock getConfig
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    nodeSettings: {
      isLiveChatEnabled: true,
      isCloudflareTurnstileEnabled: false,
    },
  }),
}));

describe('ChatMessageHandler', () => {
  let handler: ChatMessageHandler;
  let mockClient: ExtendedWebSocket;
  let mockContext: HandlerContext;
  let mockVideosService: {
    getVideo: ReturnType<typeof vi.fn>;
  };
  let mockLiveChatService: {
    createMessage: ReturnType<typeof vi.fn>;
    pruneOldMessages: ReturnType<typeof vi.fn>;
  };
  let mockCloudflareService: {
    validateTurnstileToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock to default values
    vi.mocked(getConfig).mockReturnValue({
      nodeSettings: {
        isLiveChatEnabled: true,
        isCloudflareTurnstileEnabled: false,
      },
    } as ReturnType<typeof getConfig>);

    mockVideosService = {
      getVideo: vi.fn().mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: JSON.stringify({
          chatSettings: {
            isChatHistoryEnabled: true,
            chatHistoryLimit: 100,
          },
        }),
      }),
    };

    mockLiveChatService = {
      createMessage: vi.fn().mockResolvedValue(undefined),
      pruneOldMessages: vi.fn().mockResolvedValue(undefined),
    };

    mockCloudflareService = {
      validateTurnstileToken: vi.fn().mockResolvedValue(undefined),
    };

    handler = new ChatMessageHandler(
      mockVideosService as unknown as VideosService,
      mockLiveChatService as unknown as LiveChatService,
      mockCloudflareService as unknown as CloudflareService
    );
    
    mockClient = {
      clientId: 'client_1',
      socketType: 'viewer',
      isAuthenticated: false,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      videoId: 'testvideo01',
      liveChatUsername: 'user123',
      liveChatUsernameColorCode: 'ff0000',
      ip: '127.0.0.1',
      rateLimiter: {
        timestamps: [],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      },
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name property', () => {
    it('should have correct name', () => {
      expect(handler.name).toBe('ChatMessageHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for chat message event', () => {
      expect(handler.canHandle({ eventName: 'chat', type: 'message' })).toBe(true);
    });

    it('should return false for chat join event', () => {
      expect(handler.canHandle({ eventName: 'chat', type: 'join' })).toBe(false);
    });

    it('should return false for non-chat events', () => {
      expect(handler.canHandle({ eventName: 'register' })).toBe(false);
      expect(handler.canHandle({ eventName: 'echo' })).toBe(false);
    });
  });

  describe('handle - successful message', () => {
    it('should broadcast sanitized message', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello world!',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(
        {
          eventName: 'message',
          videoId: 'testvideo01',
          chatMessageContent: 'Hello world!',
          sentTimestamp: 1234567890,
          liveChatUsername: 'user123',
          liveChatUsernameColorCode: 'ff0000',
        },
        'testvideo01'
      );
    });

    it('should sanitize HTML from message', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: '<script>alert("xss")</script>Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          chatMessageContent: 'Hello',
        }),
        'testvideo01'
      );
    });

    it('should save message to chat history if enabled', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Test message',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockLiveChatService.createMessage).toHaveBeenCalledWith({
        videoId: 'testvideo01',
        username: 'user123',
        usernameColorHexCode: 'ff0000',
        chatMessage: 'Test message',
      });
      expect(mockLiveChatService.pruneOldMessages).toHaveBeenCalledWith('testvideo01', 100);
    });

    it('should use empty strings when username and color code are undefined', async () => {
      // Remove username and color code from client
      delete (mockClient as Record<string, unknown>).liveChatUsername;
      delete (mockClient as Record<string, unknown>).liveChatUsernameColorCode;
      
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Test message',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockLiveChatService.createMessage).toHaveBeenCalledWith({
        videoId: 'testvideo01',
        username: '',
        usernameColorHexCode: '',
        chatMessage: 'Test message',
      });
    });
  });

  describe('handle - videoId mismatch', () => {
    it('should send error if videoId does not match client videoId', async () => {
      mockClient.videoId = 'different_video';
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message parameters',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should send error if client has no videoId', async () => {
      mockClient.videoId = undefined;
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message parameters',
      });
    });
  });

  describe('handle - sanitization', () => {
    it('should reject message that becomes empty after sanitization', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: '<script>alert("xss")</script>',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message parameters',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('handle - live chat disabled', () => {
    it('should send error if live chat is disabled globally', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isLiveChatEnabled: false,
          isCloudflareTurnstileEnabled: false,
        },
      } as ReturnType<typeof getConfig>);
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'live chat is currently disabled',
        sentTimestamp: 1234567890,
        liveChatUsername: 'user123',
        liveChatUsernameColorCode: 'ff0000',
      });
      expect(mockContext.broadcast).not.toHaveBeenCalled();
    });

    it('should send error if live chat is disabled for video', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: false,
        meta: '{}',
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'live chat is currently disabled',
        sentTimestamp: 1234567890,
        liveChatUsername: 'user123',
        liveChatUsernameColorCode: 'ff0000',
      });
    });
  });

  describe('handle - Turnstile validation', () => {
    it('should require Turnstile token when enabled', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isLiveChatEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as ReturnType<typeof getConfig>);
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'human verification was enabled on this MoarTube Node, please refresh your browser',
        sentTimestamp: 1234567890,
        liveChatUsername: 'user123',
        liveChatUsernameColorCode: 'ff0000',
      });
    });

    it('should validate Turnstile token when provided', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isLiveChatEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as ReturnType<typeof getConfig>);
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: 'valid-token',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalledWith(
        'valid-token',
        '127.0.0.1'
      );
      expect(mockContext.broadcast).toHaveBeenCalled();
    });

    it('should use empty string for IP if not available', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isLiveChatEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as ReturnType<typeof getConfig>);
      mockClient.ip = undefined;
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: 'valid-token',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalledWith(
        'valid-token',
        ''
      );
    });
  });

  describe('handle - rate limiting', () => {
    it('should initialize rate limiter timestamps', async () => {
      mockClient.rateLimiter!.timestamps = [];
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockClient.rateLimiter!.timestamps.length).toBe(1);
    });

    it('should reject message if rate limited and not enough time passed', async () => {
      mockClient.rateLimiter = {
        timestamps: [],
        rateLimitTimestamp: Date.now(),
        rateLimitLevel: 0,
        isRateLimited: true,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Message should be silently dropped
      expect(mockContext.broadcast).not.toHaveBeenCalled();
    });

    it('should send error if no rate limiter on client', async () => {
      mockClient.rateLimiter = undefined;
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'client not properly initialized',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should trigger rate limit after 3 fast messages', async () => {
      const now = Date.now();
      mockClient.rateLimiter = {
        timestamps: [now - 1000, now - 500],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should have sent rate limit notification
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'limited',
        rateLimitSeconds: 5,
      });
    });

    it('should increase penalty on rate limit during eagerness window', async () => {
      const now = Date.now();
      // Set up: rate limited, but enough time has passed
      // However, message sent during eagerness window
      mockClient.rateLimiter = {
        timestamps: [],
        rateLimitTimestamp: now - 6000, // 6 seconds ago (threshold is 5s for level 0)
        rateLimitLevel: 0,
        isRateLimited: true,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should increase level and extend penalty
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'limited',
        rateLimitSeconds: 10, // 5 + (1 * 5) = 10
      });
    });

    it('should reset rate limit if cooldown period has fully passed', async () => {
      const now = Date.now();
      // Set up: rate limited, but more than enough time has passed
      mockClient.rateLimiter = {
        timestamps: [],
        rateLimitTimestamp: now - 15000, // 15 seconds ago (threshold + eagerness = 8s for level 0)
        rateLimitLevel: 0,
        isRateLimited: true,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Rate limit should be reset
      expect(mockClient.rateLimiter!.isRateLimited).toBe(false);
      expect(mockClient.rateLimiter!.rateLimitLevel).toBe(-1);
      expect(mockContext.broadcast).toHaveBeenCalled();
    });
  });

  describe('handle - chat history', () => {
    it('should not save to history if disabled', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: JSON.stringify({
          chatSettings: {
            isChatHistoryEnabled: false,
          },
        }),
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockLiveChatService.createMessage).not.toHaveBeenCalled();
    });

    it('should not prune if chatHistoryLimit is 0', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: JSON.stringify({
          chatSettings: {
            isChatHistoryEnabled: true,
            chatHistoryLimit: 0,
          },
        }),
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockLiveChatService.createMessage).toHaveBeenCalled();
      expect(mockLiveChatService.pruneOldMessages).not.toHaveBeenCalled();
    });

    it('should not prune when chatHistoryLimit is undefined (defaults to 0)', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: JSON.stringify({
          chatSettings: {
            isChatHistoryEnabled: true,
            // chatHistoryLimit is intentionally not set
          },
        }),
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockLiveChatService.createMessage).toHaveBeenCalled();
      // Should not prune because limit defaults to 0
      expect(mockLiveChatService.pruneOldMessages).not.toHaveBeenCalled();
    });

    it('should handle video not found gracefully', async () => {
      mockVideosService.getVideo
        .mockResolvedValueOnce({ id: 'testvideo01', is_live_chat_enabled: true, meta: '{}' })
        .mockResolvedValueOnce(null);
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      // Should not throw
      await expect(handler.handle(mockClient, message, mockContext)).resolves.not.toThrow();
    });

    it('should handle invalid meta JSON gracefully', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: 'invalid json',
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Failed to parse video meta for chat history',
        expect.objectContaining({
          videoId: 'testvideo01',
        })
      );
    });

    it('should use default values when chatSettings missing', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'testvideo01',
        is_live_chat_enabled: true,
        meta: JSON.stringify({}),
      });
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // isChatHistoryEnabled defaults to false, so no createMessage
      expect(mockLiveChatService.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('handle - validation errors', () => {
    it('should send error for missing chatMessageContent', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid chat message format',
        expect.objectContaining({
          errors: expect.any(Array),
        })
      );
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message format',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should send error for missing videoId', async () => {
      const message = {
        eventName: 'chat',
        type: 'message',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
    });
  });

  describe('handle - error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error handling chat message',
        expect.any(Error),
        { clientId: 'client_1' }
      );
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'an error occurred while processing your message',
        sentTimestamp: 1234567890,
        liveChatUsername: 'user123',
        liveChatUsernameColorCode: 'ff0000',
      });
    });
  });

  describe('timestamps management', () => {
    it('should shift timestamps when array is full', async () => {
      mockClient.rateLimiter = {
        timestamps: [Date.now() - 10000, Date.now() - 9000, Date.now() - 8000],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should still have 3 timestamps, with oldest removed
      expect(mockClient.rateLimiter!.timestamps.length).toBe(3);
    });

    it('should add timestamp when array has 1 element', async () => {
      mockClient.rateLimiter = {
        timestamps: [Date.now() - 10000],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should have 2 timestamps now
      expect(mockClient.rateLimiter!.timestamps.length).toBe(2);
    });

    it('should add timestamp when array has 2 elements', async () => {
      mockClient.rateLimiter = {
        timestamps: [Date.now() - 10000, Date.now() - 9000],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should have 3 timestamps now
      expect(mockClient.rateLimiter!.timestamps.length).toBe(3);
    });

    it('should handle sparse timestamps array with undefined values', async () => {
      // Create a sparse array with all undefined values - after shift+push, first element will still be undefined
      const sparseTimestamps: (number | undefined)[] = [];
      sparseTimestamps.length = 3;
      // All values are undefined
      
      mockClient.rateLimiter = {
        timestamps: sparseTimestamps as number[],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Should handle gracefully without rate limiting (since firstTimestamp is undefined after shift)
      expect(mockClient.rateLimiter!.isRateLimited).toBe(false);
    });

    it('should handle timestamps array with more than 3 elements gracefully', async () => {
      // Edge case: if timestamps array somehow has > 3 elements, neither branch is taken
      mockClient.rateLimiter = {
        timestamps: [1000, 2000, 3000, 4000], // 4 elements - shouldn't happen normally
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };
      const message = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello',
        cloudflareTurnstileToken: '',
        sentTimestamp: 1234567890,
      };

      await handler.handle(mockClient, message, mockContext);

      // Array should remain unchanged (no push/shift since neither condition matches)
      expect(mockClient.rateLimiter!.timestamps.length).toBe(4);
    });
  });

  describe('non-Zod error handling', () => {
    it('should log error and send error message for non-Zod errors during parsing', async () => {
      // Test the else branch when a non-ZodError is thrown
      const { ChatMessageHandler: OriginalHandler } = await import('@websocket/handlers/chat-message.js');
      
      // Create a subclass that throws a generic error in processMessage
      class TestableChatMessageHandler extends OriginalHandler {
        protected async processMessage(): Promise<void> {
          throw new Error('Unexpected error during chat message processing');
        }
      }

      const testHandler = new TestableChatMessageHandler(
        mockVideosService as unknown as VideosService,
        mockLiveChatService as unknown as LiveChatService,
        mockCloudflareService as unknown as CloudflareService
      );
      const validMessage = {
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello world',
        cloudflareTurnstileToken: '',
        sentTimestamp: Date.now(),
      };

      await testHandler.handle(mockClient, validMessage, mockContext);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error parsing chat message',
        expect.any(Error),
        { clientId: 'client_1' }
      );
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'error',
        errorType: 'message',
        message: 'an error occurred while processing your message',
      });
      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
