/**
 * Unit tests for NodeController
 *
 * Tests main node page and related endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: {
      nodeId: 'test-node-id',
      nodeName: 'Test Node',
      nodeAbout: 'A test node',
      publicNodeProtocol: 'https',
      publicNodeAddress: 'example.com',
      publicNodePort: 443,
      cloudflareTurnstileSiteKey: '',
    },
    lastCheckedContentTracker: {
      lastCheckedCommentsTimestamp: 1000000,
      lastCheckedVideoReportsTimestamp: 1000000,
      lastCheckedCommentReportsTimestamp: 1000000,
    },
    updateLastCheckedContentTracker: vi.fn(),
    getExternalVideosBaseUrl: vi.fn(() => 'https://example.com/external/videos'),
    getExternalResourcesBaseUrl: vi.fn(() => 'https://example.com/external/resources'),
  })),
}));

import type { FastifyRequest, FastifyReply } from 'fastify';
import { NodeController } from '../../../src/controllers/node.js';

describe('NodeController', () => {
  // Mock services
  const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
    countVideos: vi.fn(),
    search: vi.fn(),
    getVideos: vi.fn(),
  };

  const mockLinksService: Record<string, ReturnType<typeof vi.fn>> = {
    getAllLinks: vi.fn(),
  };

  const mockMonetizationService: Record<string, ReturnType<typeof vi.fn>> = {
    getCryptoWalletAddresses: vi.fn(),
    getWalletAddresses: vi.fn(),
  };

  const mockStreamsService: Record<string, ReturnType<typeof vi.fn>> = {
    getActiveStreams: vi.fn(),
  };

  const mockCommentsService: Record<string, ReturnType<typeof vi.fn>> = {
    countNewComments: vi.fn(),
    countCommentsNewerThan: vi.fn(),
    updateLastCheckedTimestamp: vi.fn(),
  };

  const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
    countNewVideoReports: vi.fn(),
    countNewCommentReports: vi.fn(),
    countVideoReportsNewerThan: vi.fn(),
    countCommentReportsNewerThan: vi.fn(),
    updateLastCheckedVideoReportsTimestamp: vi.fn(),
    updateLastCheckedCommentReportsTimestamp: vi.fn(),
  };

  let controller: NodeController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    type: Mock;
    header: Mock;
    view: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new NodeController(
      mockVideosService as any,
      mockLinksService as any,
      mockMonetizationService as any,
      mockStreamsService as any,
      mockCommentsService as any,
      mockReportsService as any
    );

    mockRequest = {
      body: {},
      query: {},
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      view: vi.fn().mockResolvedValue(undefined),
    };

    // Default mock implementations
    mockVideosService.countVideos.mockResolvedValue(10);
    mockLinksService.getAllLinks.mockResolvedValue([]);
    mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
    mockStreamsService.getActiveStreams.mockResolvedValue([]);
  });

  describe('constructor', () => {
    it('should create a NodeController instance', () => {
      expect(controller).toBeInstanceOf(NodeController);
    });
  });

  describe('getNodePage', () => {
    it('should render the node page successfully', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Test Video 1', tags: 'tag1, tag2', creation_timestamp: 2000, views: 100 },
        { video_id: 'vid2', title: 'Test Video 2', tags: 'tag3', creation_timestamp: 1000, views: 50 },
      ];
      mockVideosService.countVideos.mockResolvedValue(2);
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockLinksService.getAllLinks.mockResolvedValue([{ id: 1, name: 'Link', url: 'https://example.com' }]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.getNodePage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.countVideos).toHaveBeenCalled();
      expect(mockLinksService.getAllLinks).toHaveBeenCalled();
      expect(mockMonetizationService.getWalletAddresses).toHaveBeenCalled();
      expect(mockReply.view).toHaveBeenCalledWith('node', expect.objectContaining({
        model: expect.objectContaining({
          informationData: expect.any(Object),
          linksData: expect.any(Object),
          tagsData: expect.any(Object),
          searchResultsData: expect.any(Object),
        }),
      }));
    });

    it('should handle search with search term', async () => {
      mockRequest.query = {
        searchTerm: 'test search',
        sortTerm: 'popular',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Test Video', tags: 'test', creation_timestamp: 1000, views: 100 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.getNodePage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.getVideos).toHaveBeenCalledWith(expect.objectContaining({
        isPublished: true,
        search: 'test search',
      }));
    });

    it('should return error on service failure', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      mockVideosService.countVideos.mockRejectedValue(new Error('Database error'));

      await controller.getNodePage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith('node page rendering error');
    });

    it('should skip empty tags when collecting unique tags', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      // Videos with empty tags mixed in
      const mockVideos = [
        { video_id: 'vid1', title: 'Video 1', tags: 'tag1, , tag2', creation_timestamp: 2000, views: 100 },
        { video_id: 'vid2', title: 'Video 2', tags: '  ,  ', creation_timestamp: 1000, views: 50 },
      ];
      mockVideosService.countVideos.mockResolvedValue(2);
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockLinksService.getAllLinks.mockResolvedValue([]);
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.getNodePage(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.view).toHaveBeenCalledWith('node', expect.objectContaining({
        model: expect.objectContaining({
          // Tags set should only contain non-empty tags
          tagsData: expect.objectContaining({
            tags: expect.arrayContaining(['tag1', 'tag2']),
          }),
        }),
      }));
      // Verify empty tags were not included
      const callArgs = mockReply.view.mock.calls[0][1];
      expect(callArgs.model.tagsData.tags).not.toContain('');
      expect(callArgs.model.tagsData.tags).not.toContain('  ');
    });
  });

  describe('search', () => {
    it('should search videos', async () => {
      mockRequest.query = {
        searchTerm: 'test',
        sortTerm: 'popular',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Test Video 1', tags: 'tag1, tag2', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'Test Video 2', tags: 'tag2, tag3', views: 50, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.getVideos).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should sort videos by latest', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Old Video', tags: 'tag1', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'New Video', tags: 'tag1', views: 50, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults[0].video_id).toBe('vid2'); // New video first
    });

    it('should sort videos by oldest', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'oldest',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Old Video', tags: 'tag1', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'New Video', tags: 'tag1', views: 50, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults[0].video_id).toBe('vid1'); // Old video first
    });

    it('should not sort when sortTerm is unrecognized', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'unknown',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Video 1', tags: 'tag1', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'Video 2', tags: 'tag2', views: 50, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      // Videos should be returned in their original order (no sorting applied)
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults).toHaveLength(2);
    });

    it('should sort videos by popular (views)', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'popular',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Less Popular', tags: 'tag1', views: 50, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'Most Popular', tags: 'tag1', views: 200, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults[0].video_id).toBe('vid2'); // Most popular first
    });

    it('should filter by specific tag', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: 'specific-tag',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Has Tag', tags: 'specific-tag, other', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'No Tag', tags: 'other-tag', views: 50, creation_timestamp: 2000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults).toHaveLength(1);
      expect(sentData.searchResults[0].video_id).toBe('vid1');
    });

    it('should merge videos with live streams', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Video', tags: 'tag1', views: 100, creation_timestamp: 1000 },
      ];
      const mockLiveStreams = [
        { video_id: 'live1', title: 'Live Stream', tags: 'live', views: 0, creation_timestamp: 3000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue(mockLiveStreams);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults).toHaveLength(2);
    });

    it('should not duplicate videos that are also live streams', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      const mockVideos = [
        { video_id: 'vid1', title: 'Video', tags: 'tag1', views: 100, creation_timestamp: 1000 },
      ];
      const mockLiveStreams = [
        { video_id: 'vid1', title: 'Video (Live)', tags: 'tag1', views: 100, creation_timestamp: 1000 },
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue(mockLiveStreams);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults).toHaveLength(1);
    });

    it('should apply tag limit when no specific tag is given', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      // Create 6 videos all with same tag - should be limited to 4
      const mockVideos = Array.from({ length: 6 }, (_, i) => ({
        video_id: `vid${i}`,
        title: `Video ${i}`,
        tags: 'same-tag',
        views: 100 - i,
        creation_timestamp: 6000 - i * 1000,
      }));
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      // With tag limit of 4, only 4 videos should be returned
      expect(sentData.searchResults.length).toBeLessThanOrEqual(4);
    });

    it('should skip empty tags when applying tag limit', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      // Use explicit empty tags: ",," will split into ['', '', ''] which are all empty after trim()
      // This forces the continue statement to be hit for every tag
      // vid3 with only empty tags will be EXCLUDED because shouldAddVideoByTagLimit returns false
      const mockVideos = [
        { video_id: 'vid1', title: 'Video 1', tags: 'tag1, , ', views: 100, creation_timestamp: 1000 },
        { video_id: 'vid2', title: 'Video 2', tags: ', , tag2', views: 50, creation_timestamp: 2000 },
        { video_id: 'vid3', title: 'Video 3', tags: '  ,  ,  ', views: 30, creation_timestamp: 3000 }, // Only empty tags - will be excluded
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      // Only 2 videos should be included - vid3 is excluded because it has no valid tags
      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.searchResults.length).toBe(2);
      expect(sentData.searchResults.find((v: any) => v.video_id === 'vid3')).toBeUndefined();
    });

    it('should exclude videos when all their tags are at the limit', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'latest',
        tagTerm: '',
      };

      // Create videos where the 5th video's only tag is already at limit (4)
      const mockVideos = [
        { video_id: 'vid1', title: 'Video 1', tags: 'onlytag', views: 100, creation_timestamp: 5000 },
        { video_id: 'vid2', title: 'Video 2', tags: 'onlytag', views: 90, creation_timestamp: 4000 },
        { video_id: 'vid3', title: 'Video 3', tags: 'onlytag', views: 80, creation_timestamp: 3000 },
        { video_id: 'vid4', title: 'Video 4', tags: 'onlytag', views: 70, creation_timestamp: 2000 },
        { video_id: 'vid5', title: 'Video 5', tags: 'onlytag', views: 60, creation_timestamp: 1000 }, // Should be excluded - tag at limit
      ];
      mockVideosService.getVideos.mockResolvedValue({ data: mockVideos });
      mockStreamsService.getActiveStreams.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      // Only 4 videos should be included (tag limit is 4)
      expect(sentData.searchResults.length).toBe(4);
      // The 5th video should be excluded because its only tag is at the limit
      expect(sentData.searchResults.find((v: any) => v.video_id === 'vid5')).toBeUndefined();
    });

    it('should return error on service failure', async () => {
      mockRequest.query = {
        searchTerm: '',
        sortTerm: 'recent',
        tagTerm: '',
      };

      mockVideosService.getVideos.mockRejectedValue(new Error('Database error'));

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('getNewContentCounts', () => {
    it('should get new content counts', async () => {
      mockCommentsService.countCommentsNewerThan.mockResolvedValue(5);
      mockReportsService.countVideoReportsNewerThan.mockResolvedValue(2);
      mockReportsService.countCommentReportsNewerThan.mockResolvedValue(1);

      await controller.getNewContentCounts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCommentsService.countCommentsNewerThan).toHaveBeenCalled();
      expect(mockReportsService.countVideoReportsNewerThan).toHaveBeenCalled();
      expect(mockReportsService.countCommentReportsNewerThan).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        newContentCounts: {
          newCommentsCount: 5,
          newVideoReportsCount: 2,
          newCommentReportsCount: 1,
        },
      });
    });

    it('should return zero counts when no new content', async () => {
      mockCommentsService.countCommentsNewerThan.mockResolvedValue(0);
      mockReportsService.countVideoReportsNewerThan.mockResolvedValue(0);
      mockReportsService.countCommentReportsNewerThan.mockResolvedValue(0);

      await controller.getNewContentCounts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        newContentCounts: {
          newCommentsCount: 0,
          newVideoReportsCount: 0,
          newCommentReportsCount: 0,
        },
      });
    });

    it('should return error on service failure', async () => {
      mockCommentsService.countCommentsNewerThan.mockRejectedValue(new Error('Database error'));

      await controller.getNewContentCounts(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('contentChecked', () => {
    it('should update comments checked timestamp', async () => {
      mockRequest.body = { contentType: 'comments' };

      await controller.contentChecked(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // The config.updateLastCheckedContentTracker is called internally
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update video reports checked timestamp', async () => {
      mockRequest.body = { contentType: 'videoReports' };

      await controller.contentChecked(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update comment reports checked timestamp', async () => {
      mockRequest.body = { contentType: 'commentReports' };

      await controller.contentChecked(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return success even for unknown content type (no-op)', async () => {
      mockRequest.body = { contentType: 'unknown' };

      await controller.contentChecked(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // The switch just does nothing for unknown types
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { contentType: 'comments' };

      // Mock getConfig to throw an error
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.contentChecked(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
