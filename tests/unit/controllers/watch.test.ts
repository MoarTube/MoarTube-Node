/**
 * WatchController Tests
 *
 * Tests for the main video watch page rendering.
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
      cloudflareTurnstileSiteKey: 'test-turnstile-key',
    },
    getExternalVideosBaseUrl: vi.fn(() => 'https://videos.example.com'),
    getExternalResourcesBaseUrl: vi.fn(() => 'https://resources.example.com'),
  })),
}));

import { WatchController } from '@controllers/watch.js';

// Mock services
const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
  getVideo: vi.fn(),
  countVideos: vi.fn(),
  getVideos: vi.fn(),
};

const mockLinksService: Record<string, ReturnType<typeof vi.fn>> = {
  getAllLinks: vi.fn(),
};

const mockMonetizationService: Record<string, ReturnType<typeof vi.fn>> = {
  getWalletAddresses: vi.fn(),
};

const mockCommentsService: Record<string, ReturnType<typeof vi.fn>> = {
  getCommentsForVideo: vi.fn(),
};

describe('WatchController', () => {
  let controller: WatchController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
    view: Mock;
  };

  const createMockVideo = (overrides = {}) => ({
    video_id: 'video123',
    title: 'Test Video',
    description: 'Test description',
    tags: 'tag1,tag2',
    views: 100,
    likes: 10,
    dislikes: 2,
    is_published: true,
    is_streaming: false,
    is_streamed: false,
    is_live: false,
    is_comments_enabled: true,
    is_reports_enabled: true,
    creation_timestamp: 1704067200000,
    length_seconds: 120,
    outputs: JSON.stringify({
      m3u8: ['720p', '1080p'],
      mp4: ['720p'],
    }),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new WatchController(
      mockVideosService as any,
      mockLinksService as any,
      mockMonetizationService as any,
      mockCommentsService as any
    );

    mockRequest = {
      query: { v: 'video123' },
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
    it('should create a WatchController instance', () => {
      expect(controller).toBeInstanceOf(WatchController);
    });

    it('should store all service dependencies', () => {
      // The controller should be created without errors
      const newController = new WatchController(
        mockVideosService as any,
        mockLinksService as any,
        mockMonetizationService as any,
        mockCommentsService as any
      );
      expect(newController).toBeInstanceOf(WatchController);
    });
  });

  describe('getWatchPage', () => {
    it('should return 404 when video is not found', async () => {
      mockRequest.query = { v: 'nonexistent' };
      mockVideosService.getVideo.mockResolvedValue(null);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('nonexistent');
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'that video could not be loaded',
      });
    });

    it('should render watch page when video is found', async () => {
      const mockVideo = createMockVideo();

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(50);
      mockVideosService.getVideos.mockResolvedValue({
        data: [
          {
            video_id: 'rec1',
            title: 'Recommended 1',
            tags: 'tag1',
            views: 100,
            is_live: false,
            is_streaming: false,
            length_seconds: 60,
            creation_timestamp: 1704067200000,
          },
        ],
      });
      mockLinksService.getAllLinks.mockResolvedValue([
        { id: 1, url: 'https://example.com', label: 'Example' },
      ]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([
        { id: 1, chain_id: 1, address: '0x123' },
      ]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([
        { comment_id: 1, timestamp: 1704067200000, comment_plain_text_sanitized: 'Great video!' },
      ]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('video123');
      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          informationData: expect.objectContaining({
            isError: false,
            information: expect.objectContaining({
              nodeId: 'node123',
              nodeName: 'Test Node',
            }),
          }),
          videoData: expect.objectContaining({
            isError: false,
            video: expect.objectContaining({
              videoId: 'video123',
              title: 'Test Video',
            }),
          }),
        }),
      }));
    });

    it('should return 500 when an error occurs', async () => {
      mockRequest.query = { v: 'video123' };
      mockVideosService.getVideo.mockRejectedValue(new Error('Database error'));

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'that video could not be loaded',
      });
    });

    it('should fetch all page data in parallel', async () => {
      const mockVideo = createMockVideo();

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Verify all services were called
      expect(mockVideosService.countVideos).toHaveBeenCalledWith({ isPublished: true });
      expect(mockLinksService.getAllLinks).toHaveBeenCalled();
      expect(mockMonetizationService.getWalletAddresses).toHaveBeenCalled();
      expect(mockCommentsService.getCommentsForVideo).toHaveBeenCalledWith(
        'video123',
        'before',
        'ascending',
        expect.any(Number)
      );
      expect(mockVideosService.getVideos).toHaveBeenCalledWith({
        limit: 10,
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      });
    });

    it('should include recommended videos in page data', async () => {
      const mockVideo = createMockVideo();
      const recommendedVideos = [
        {
          video_id: 'rec1',
          title: 'Recommended 1',
          tags: 'tag1',
          views: 50,
          is_live: false,
          is_streaming: false,
          length_seconds: 90,
          creation_timestamp: 1704067200000,
        },
        {
          video_id: 'rec2',
          title: 'Recommended 2',
          tags: 'tag2',
          views: 75,
          is_live: true,
          is_streaming: true,
          length_seconds: 0,
          creation_timestamp: 1704153600000,
        },
      ];

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(100);
      mockVideosService.getVideos.mockResolvedValue({ data: recommendedVideos });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          recommendedVideosData: expect.objectContaining({
            isError: false,
            recommendedVideos: expect.arrayContaining([
              expect.objectContaining({
                videoId: 'rec1',
                title: 'Recommended 1',
              }),
              expect.objectContaining({
                videoId: 'rec2',
                title: 'Recommended 2',
                isLive: true,
                isStreaming: true,
              }),
            ]),
          }),
        }),
      }));
    });

    it('should include comments in page data', async () => {
      const mockVideo = createMockVideo();
      const comments = [
        { comment_id: 1, timestamp: 1704067200000, comment_plain_text_sanitized: 'First comment' },
        { comment_id: 2, timestamp: 1704153600000, comment_plain_text_sanitized: 'Second comment' },
      ];

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(5);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue(comments);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          commentsData: expect.objectContaining({
            isError: false,
            comments: expect.arrayContaining([
              expect.objectContaining({
                commentId: 1,
                commentPlainTextSanitized: 'First comment',
              }),
              expect.objectContaining({
                commentId: 2,
                commentPlainTextSanitized: 'Second comment',
              }),
            ]),
          }),
        }),
      }));
    });

    it('should build video sources with adaptive and progressive formats', async () => {
      const mockVideo = createMockVideo({
        outputs: JSON.stringify({
          m3u8: ['720p', '1080p'],
          mp4: ['720p', '1080p'],
          webm: ['720p'],
          ogv: ['480p'],
        }),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          videoData: expect.objectContaining({
            video: expect.objectContaining({
              isHlsAvailable: true,
              isMp4Available: true,
              isWebmAvailable: true,
              isOgvAvailable: true,
            }),
          }),
          adaptiveSources: expect.arrayContaining([
            expect.objectContaining({ type: 'application/vnd.apple.mpegurl' }),
          ]),
          progressiveSources: expect.arrayContaining([
            expect.objectContaining({ type: 'video/mp4' }),
            expect.objectContaining({ type: 'video/webm' }),
            expect.objectContaining({ type: 'video/ogg' }),
          ]),
        }),
      }));
    });

    it('should include external base URLs in page data', async () => {
      const mockVideo = createMockVideo();

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          externalVideosBaseUrl: 'https://videos.example.com',
          externalResourcesBaseUrl: 'https://resources.example.com',
        }),
      }));
    });

    it('should include links and wallet addresses in page data', async () => {
      const mockVideo = createMockVideo();
      const links = [
        { id: 1, url: 'https://github.com', label: 'GitHub' },
        { id: 2, url: 'https://twitter.com', label: 'Twitter' },
      ];
      const walletAddresses = [
        { id: 1, chain_id: 1, address: '0xETH' },
        { id: 2, chain_id: 137, address: '0xPOLY' },
      ];

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue(links);
      mockMonetizationService.getWalletAddresses.mockResolvedValue(walletAddresses);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          linksData: expect.objectContaining({
            isError: false,
            links: expect.arrayContaining([
              expect.objectContaining({ url: 'https://github.com' }),
              expect.objectContaining({ url: 'https://twitter.com' }),
            ]),
          }),
          cryptoWalletAddressesData: expect.objectContaining({
            isError: false,
            cryptoWalletAddresses: expect.arrayContaining([
              expect.objectContaining({ address: '0xETH' }),
              expect.objectContaining({ address: '0xPOLY' }),
            ]),
          }),
        }),
      }));
    });

    it('should handle video with no outputs gracefully', async () => {
      const mockVideo = createMockVideo({
        is_published: false,
        is_live: false,
        outputs: JSON.stringify({}),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          videoData: expect.objectContaining({
            video: expect.objectContaining({
              isHlsAvailable: false,
              isMp4Available: false,
              isWebmAvailable: false,
              isOgvAvailable: false,
            }),
          }),
          adaptiveSources: [],
          progressiveSources: [],
        }),
      }));
    });

    it('should handle format with null resolutions array', async () => {
      const mockVideo = createMockVideo({
        is_published: true,
        outputs: JSON.stringify({
          m3u8: null, // Null resolutions - should be handled gracefully
          mp4: ['720p'],
        }),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Should not throw and should handle mp4 correctly
      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          progressiveSources: expect.arrayContaining([
            expect.objectContaining({ type: 'video/mp4' }),
          ]),
        }),
      }));
    });

    it('should skip unknown formats not in sourcesFormatsAndResolutions', async () => {
      const mockVideo = createMockVideo({
        is_published: true,
        outputs: JSON.stringify({
          unknownFormat: ['720p'], // Unknown format - should be skipped
          mp4: ['720p'],
        }),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Should handle mp4 but skip unknown format
      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          progressiveSources: expect.arrayContaining([
            expect.objectContaining({ type: 'video/mp4' }),
          ]),
        }),
      }));
    });

    it('should include node information in page data', async () => {
      const mockVideo = createMockVideo();

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(42);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          informationData: expect.objectContaining({
            isError: false,
            information: expect.objectContaining({
              nodeVideoCount: 42,
              nodeId: 'node123',
              nodeName: 'Test Node',
              nodeAbout: 'Test about',
              publicNodeProtocol: 'https',
              publicNodeAddress: 'example.com',
              publicNodePort: '443',
              cloudflareTurnstileSiteKey: 'test-turnstile-key',
            }),
          }),
        }),
      }));
    });

    it('should handle streaming video with dynamic manifest', async () => {
      const mockVideo = createMockVideo({
        is_streaming: true,
        outputs: JSON.stringify({
          m3u8: ['720p'],
        }),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          adaptiveSources: expect.arrayContaining([
            expect.objectContaining({
              src: expect.stringContaining('/dynamic/manifests/'),
            }),
          ]),
        }),
      }));
    });

    it('should skip unknown format types when building video sources', async () => {
      // Include an unknown format 'avi' that should be skipped via the continue statement
      const mockVideo = createMockVideo({
        outputs: JSON.stringify({
          m3u8: ['720p'],
          mp4: ['720p'],
          avi: ['720p'], // Unknown format - should be skipped
          mkv: ['1080p'], // Unknown format - should be skipped
        }),
      });

      mockVideosService.getVideo.mockResolvedValue(mockVideo);
      mockVideosService.countVideos.mockResolvedValue(10);
      mockVideosService.getVideos.mockResolvedValue({ data: [] });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);

      await controller.getWatchPage(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // Verify the unknown formats are not in progressiveSources
      expect(mockReply.view).toHaveBeenCalledWith('watch.ejs', expect.objectContaining({
        model: expect.objectContaining({
          progressiveSources: expect.not.arrayContaining([
            expect.objectContaining({ src: expect.stringContaining('/avi/') }),
            expect.objectContaining({ src: expect.stringContaining('/mkv/') }),
          ]),
          // But the known formats should be there
          adaptiveSources: expect.arrayContaining([
            expect.objectContaining({ type: 'application/vnd.apple.mpegurl' }),
          ]),
        }),
      }));
    });
  });
});
