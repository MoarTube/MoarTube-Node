/**
 * WatchEmbedController Tests
 *
 * Tests for embedded video and chat page rendering.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock config
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: {
      nodeName: 'Test Node',
      nodeAbout: 'Test about',
      nodeId: 'node123',
      publicNodeProtocol: 'https',
      publicNodeAddress: 'example.com',
      publicNodePort: '443',
      isCloudflareTurnstileEnabled: false,
      cloudflareTurnstileSiteKey: '',
    },
    getExternalVideosBaseUrl: vi.fn(() => 'https://videos.example.com'),
    getExternalResourcesBaseUrl: vi.fn(() => 'https://resources.example.com'),
  })),
}));

import { WatchEmbedController } from '@controllers/watch-embed.js';

// Mock services
const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
  getVideo: vi.fn(),
};

const mockLinksService: Record<string, ReturnType<typeof vi.fn>> = {
  getAllLinks: vi.fn(),
};

const mockMonetizationService: Record<string, ReturnType<typeof vi.fn>> = {
  getWalletAddresses: vi.fn(),
};

describe('WatchEmbedController', () => {
  let controller: WatchEmbedController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
    view: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new WatchEmbedController(
      mockVideosService as any,
      mockLinksService as any,
      mockMonetizationService as any
    );

    mockRequest = {
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      view: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create a WatchEmbedController instance', () => {
      expect(controller).toBeInstanceOf(WatchEmbedController);
    });
  });

  describe('getEmbedVideo', () => {
    it('should return 404 when video is not found', async () => {
      mockRequest.params = { videoId: 'nonexistent' };
      mockVideosService.getVideo.mockResolvedValue(null);

      await controller.getEmbedVideo(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('nonexistent');
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'video not found',
      });
    });

    it('should render embed-video template when video is found', async () => {
      mockRequest.params = { videoId: 'video123' };

      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Test Description',
        views: 100,
        is_publishing: false,
        is_published: true,
        is_live: false,
        is_streaming: false,
        is_streamed: false,
        comments: 5,
        creation_timestamp: Date.now(),
        outputs: '{}',
      };

      mockVideosService.getVideo.mockResolvedValue(mockVideo);

      await controller.getEmbedVideo(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.view).toHaveBeenCalledWith(
        'embed-video.ejs',
        expect.objectContaining({
          model: expect.objectContaining({
            videoData: expect.objectContaining({
              video: expect.objectContaining({
                title: 'Test Video',
              }),
            }),
          }),
        })
      );
    });

    it('should return 500 error on service failure', async () => {
      mockRequest.params = { videoId: 'video123' };
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));

      await controller.getEmbedVideo(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('getEmbedChat', () => {
    it('should return 404 when video is not found', async () => {
      mockRequest.params = { videoId: 'nonexistent' };
      mockVideosService.getVideo.mockResolvedValue(null);

      await controller.getEmbedChat(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('nonexistent');
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'video not found',
      });
    });

    it('should render embed-chat template when video is found', async () => {
      mockRequest.params = { videoId: 'video123' };

      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        is_live_chat_enabled: true,
        is_live: true,
        is_streaming: true,
      };

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);

      await controller.getEmbedChat(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.view).toHaveBeenCalledWith(
        'embed-chat',
        expect.objectContaining({
          model: expect.objectContaining({
            videoId: 'video123',
            isLiveChatEnabled: true,
            isLive: true,
            isStreaming: true,
          }),
        })
      );
    });

    it('should include links and wallet addresses in chat model', async () => {
      mockRequest.params = { videoId: 'video123' };

      const mockVideo = {
        video_id: 'video123',
        is_live_chat_enabled: false,
        is_live: false,
        is_streaming: false,
      };

      const mockLinks = [{ id: 1, url: 'https://twitter.com/test' }];
      const mockWallets = [{ id: 1, walletAddress: '0x123' }];

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockLinksService.getAllLinks.mockResolvedValue(mockLinks);
      mockMonetizationService.getWalletAddresses.mockResolvedValue(mockWallets);

      await controller.getEmbedChat(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.view).toHaveBeenCalledWith(
        'embed-chat',
        expect.objectContaining({
          model: expect.objectContaining({
            links: mockLinks,
            cryptoWalletAddresses: mockWallets,
          }),
        })
      );
    });

    it('should return 500 error on service failure', async () => {
      mockRequest.params = { videoId: 'video123' };
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));

      await controller.getEmbedChat(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
