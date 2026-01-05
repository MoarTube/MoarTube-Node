/**
 * Unit tests for VideosController
 *
 * Tests HTTP request handling for video-related operations.
 * Focuses on the core controller methods with properly matched service methods.
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
const mockNodeSettings = {
  isCloudflareTurnstileEnabled: false,
  cloudflareTurnstileSecretKey: 'test-secret',
  isLikesEnabled: true,
  isDislikesEnabled: true,
  isReportsEnabled: true,
  isCommentsEnabled: true,
  isLiveChatEnabled: true,
};

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: mockNodeSettings,
    updateNodeSettings: vi.fn(),
  })),
}));

// Mock fs
vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue({
    pipe: vi.fn(),
    on: vi.fn((event, cb) => {
      if (event === 'close') setTimeout(cb, 10);
      return { pipe: vi.fn() };
    }),
  }),
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  default: {
    createReadStream: vi.fn().mockReturnValue({
      pipe: vi.fn(),
      on: vi.fn((event, cb) => {
        if (event === 'close') setTimeout(cb, 10);
        return { pipe: vi.fn() };
      }),
    }),
    statSync: vi.fn().mockReturnValue({ size: 1024 }),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import { VideosController } from '@controllers/videos.js';

// Create mock request/reply helpers
function createMockRequest(
  overrides: Partial<FastifyRequest> & { ip?: string } = {}
): FastifyRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
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
    raw: { write: vi.fn(), end: vi.fn() },
  } as unknown as FastifyReply;
}

describe('VideosController', () => {
  let controller: VideosController;
  let mockVideosService: Record<string, ReturnType<typeof vi.fn>>;
  let mockCommentsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockVideoUploadService: Record<string, ReturnType<typeof vi.fn>>;
  let mockCloudflareService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReportsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockReply: FastifyReply;

  beforeEach(() => {
    // Initialize all mock services with common methods
    mockVideosService = {
      createVideo: vi.fn(),
      setImported: vi.fn(),
      setImporting: vi.fn(),
      setPublishing: vi.fn(),
      publishVideo: vi.fn(),
      unpublishVideo: vi.fn(),
      notifyUploadComplete: vi.fn(),
      notifyStreamComplete: vi.fn(),
      setError: vi.fn(),
      setSourceFileExtension: vi.fn(),
      getSourceFileExtension: vi.fn(),
      getPublishes: vi.fn(),
      unpublishFormatResolution: vi.fn(),
      markFormatResolutionPublished: vi.fn(),
      getVideo: vi.fn(),
      getVideos: vi.fn(),
      updateVideo: vi.fn(),
      deleteVideo: vi.fn(),
      deleteVideos: vi.fn(),
      finalizeVideo: vi.fn(),
      finalizeVideos: vi.fn(),
      incrementViewsDebounced: vi.fn(),
      incrementLikes: vi.fn(),
      incrementDislikes: vi.fn(),
      getWatchData: vi.fn(),
      getVideoData: vi.fn(),
      getAllVideosData: vi.fn(),
      getRecommendedVideos: vi.fn(),
      getTags: vi.fn(),
      getPublishedTags: vi.fn(),
      getAllTags: vi.fn(),
      getVideoByAlias: vi.fn(),
      setVideoLengths: vi.fn(),
      setVideoLength: vi.fn(),
      setIndexOutdated: vi.fn(),
      markIndexOutdated: vi.fn(),
      writeMasterManifest: vi.fn(),
      addToIndex: vi.fn(),
      removeFromIndex: vi.fn(),
      purgeWatchPages: vi.fn(),
      getPermissions: vi.fn(),
      getAliasUrl: vi.fn(),
    };

    mockCommentsService = {
      getVideoComments: vi.fn(),
      getCommentsForVideo: vi.fn(),
      addComment: vi.fn(),
      createComment: vi.fn(),
      getComment: vi.fn(),
      deleteComment: vi.fn(),
    };

    mockVideoUploadService = {
      uploadVideo: vi.fn(),
      uploadStream: vi.fn(),
      uploadImage: vi.fn(),
      validateVideoUploadParams: vi.fn(),
      isValidVideoMimeType: vi.fn(),
      isValidStreamMimeType: vi.fn(),
      isValidImageMimeType: vi.fn(),
      getVideoDestinationPath: vi.fn(),
      getStreamDestinationPath: vi.fn(),
      getImageDestinationPath: vi.fn(),
      saveUploadedFile: vi.fn(),
      trackProgress: vi.fn(),
      handleVideoUploadComplete: vi.fn(),
      handleStreamUploadComplete: vi.fn(),
      handleImageUploadComplete: vi.fn(),
      handleUploadError: vi.fn(),
    };

    mockCloudflareService = {
      verifyTurnstileToken: vi.fn(),
      validateTurnstileToken: vi.fn(),
      purgeWatchPages: vi.fn(),
    };

    mockReportsService = {
      createVideoReport: vi.fn(),
    };

    controller = new VideosController(
      mockVideosService as never,
      mockCommentsService as never,
      mockVideoUploadService as never,
      mockCloudflareService as never,
      mockReportsService as never
    );

    mockReply = createMockReply();

    // Reset node settings
    mockNodeSettings.isCloudflareTurnstileEnabled = false;
    mockNodeSettings.isLikesEnabled = true;
    mockNodeSettings.isDislikesEnabled = true;
    mockNodeSettings.isReportsEnabled = true;
    mockNodeSettings.isCommentsEnabled = true;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a VideosController instance', () => {
      expect(controller).toBeInstanceOf(VideosController);
    });
  });

  // ==================
  // Video Import Tests
  // ==================
  describe('importVideo', () => {
    it('should successfully import a video', async () => {
      const mockResult = { videoId: 'vid-123', message: 'Video created' };
      mockVideosService.createVideo.mockResolvedValue(mockResult);

      const mockRequest = createMockRequest({
        body: {
          title: 'Test Video',
          description: 'Test Description',
          tags: 'tag1,tag2',
        },
      });

      await controller.importVideo(mockRequest, mockReply);

      expect(mockVideosService.createVideo).toHaveBeenCalledWith({
        title: 'Test Video',
        description: 'Test Description',
        tags: 'tag1,tag2',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 error when import fails', async () => {
      mockVideosService.createVideo.mockRejectedValue(new Error('Import failed'));

      const mockRequest = createMockRequest({
        body: { title: 'Test Video', description: '', tags: '' },
      });

      await controller.importVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('videoImported', () => {
    it('should mark video as imported', async () => {
      mockVideosService.setImported.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.videoImported(mockRequest, mockReply);

      expect(mockVideosService.setImported).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('videoImportedFromBody', () => {
    it('should mark video as imported using body videoId', async () => {
      mockVideosService.setImported.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        body: { videoId: 'vid-456' },
      });

      await controller.videoImportedFromBody(mockRequest, mockReply);

      expect(mockVideosService.setImported).toHaveBeenCalledWith('vid-456');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.setImported.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        body: { videoId: 'vid-456' },
      });

      await controller.videoImportedFromBody(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('stopImporting', () => {
    it('should stop video importing', async () => {
      mockVideosService.setImporting.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.stopImporting(mockRequest, mockReply);

      expect(mockVideosService.setImporting).toHaveBeenCalledWith('vid-123', false);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ======================
  // Video Publishing Tests
  // ======================
  describe('startPublishing', () => {
    it('should start video publishing', async () => {
      mockVideosService.setPublishing.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.startPublishing(mockRequest, mockReply);

      expect(mockVideosService.setPublishing).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('videoPublished', () => {
    it('should complete video publishing', async () => {
      mockVideosService.setPublishing.mockResolvedValue(undefined);
      mockVideosService.publishVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.videoPublished(mockRequest, mockReply);

      expect(mockVideosService.setPublishing).toHaveBeenCalledWith('vid-123', false);
      expect(mockVideosService.publishVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('stopPublishing', () => {
    it('should stop video publishing by setting publishing to false', async () => {
      mockVideosService.setPublishing.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.stopPublishing(mockRequest, mockReply);

      expect(mockVideosService.setPublishing).toHaveBeenCalledWith('vid-123', false);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('formatResolutionPublished', () => {
    it('should mark format/resolution as published', async () => {
      mockVideosService.markFormatResolutionPublished.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });

      await controller.formatResolutionPublished(mockRequest, mockReply);

      expect(mockVideosService.markFormatResolutionPublished).toHaveBeenCalledWith(
        'vid-123',
        'mp4',
        '1080p'
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===================
  // Video Status Tests
  // ===================
  describe('videoUploaded', () => {
    it('should notify upload complete', async () => {
      mockVideosService.notifyUploadComplete.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });

      await controller.videoUploaded(mockRequest, mockReply);

      expect(mockVideosService.notifyUploadComplete).toHaveBeenCalledWith('vid-123', 'mp4', '1080p');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('videoStreamed', () => {
    it('should notify stream complete', async () => {
      mockVideosService.notifyStreamComplete.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '720p' },
      });

      await controller.videoStreamed(mockRequest, mockReply);

      expect(mockVideosService.notifyStreamComplete).toHaveBeenCalledWith('vid-123', 'mp4', '720p');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('videoError', () => {
    it('should mark video as errored', async () => {
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.videoError(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // =================
  // Video CRUD Tests
  // =================
  describe('getVideo', () => {
    it('should return video by ID', async () => {
      const mockVideo = { id: 'vid-123', title: 'Test Video' };
      mockVideosService.getVideo.mockResolvedValue(mockVideo);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideo(mockRequest, mockReply);

      expect(mockVideosService.getVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('Not found'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('searchVideos', () => {
    it('should search videos with query parameters', async () => {
      const mockResult = {
        data: [{ id: 'vid-1', title: 'Test' }],
      };
      mockVideosService.getVideos.mockResolvedValue(mockResult);

      const mockRequest = createMockRequest({
        query: {
          searchTerm: 'test',
          sortTerm: 'latest',
          tagTerm: 'tag1',
          tagLimit: 10,
          timestamp: Date.now(),
        },
      });

      await controller.searchVideos(mockRequest, mockReply);

      expect(mockVideosService.getVideos).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle popular sort term', async () => {
      mockVideosService.getVideos.mockResolvedValue({ data: [] });

      const mockRequest = createMockRequest({
        query: {
          sortTerm: 'popular',
          tagLimit: 10,
          timestamp: Date.now(),
        },
      });

      await controller.searchVideos(mockRequest, mockReply);

      expect(mockVideosService.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'views' })
      );
    });

    it('should handle oldest sort term', async () => {
      mockVideosService.getVideos.mockResolvedValue({ data: [] });

      const mockRequest = createMockRequest({
        query: {
          sortTerm: 'oldest',
          tagLimit: 10,
          timestamp: Date.now(),
        },
      });

      await controller.searchVideos(mockRequest, mockReply);

      expect(mockVideosService.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ sortDirection: 'asc' })
      );
    });
  });

  describe('updateVideo', () => {
    it('should update video details', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          title: 'Updated Title',
          description: 'Updated Description',
          tags: 'new,tags',
        },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        title: 'Updated Title',
        description: 'Updated Description',
        tags: 'new,tags',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.updateVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          title: 'Updated Title',
        },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should update video with only title defined', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          title: 'Only Title',
        },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        title: 'Only Title',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update video with only description defined', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          description: 'Only Description',
        },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        description: 'Only Description',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update video with only tags defined', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          tags: 'only,tags',
        },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        tags: 'only,tags',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteVideo', () => {
    it('should delete video', async () => {
      mockVideosService.deleteVideo.mockResolvedValue(true);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.deleteVideo(mockRequest, mockReply);

      expect(mockVideosService.deleteVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.deleteVideo.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.deleteVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('finalizeVideo', () => {
    it('should finalize video', async () => {
      mockVideosService.finalizeVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.finalizeVideo(mockRequest, mockReply);

      expect(mockVideosService.finalizeVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ========================
  // Video Interaction Tests
  // ========================
  describe('incrementViews', () => {
    it('should increment video views', async () => {
      mockVideosService.incrementViewsDebounced.mockResolvedValue({ views: 100 });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.incrementViews(mockRequest, mockReply);

      expect(mockVideosService.incrementViewsDebounced).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        views: 100,
      });
    });
  });

  describe('likeVideo', () => {
    it('should like video when likes are enabled', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_likes_enabled: true,
      });
      mockVideosService.incrementLikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockVideosService.incrementLikes).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when likes globally disabled', async () => {
      mockNodeSettings.isLikesEnabled = false;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should like video when body is null', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_likes_enabled: true,
      });
      mockVideosService.incrementLikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: null,
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockVideosService.incrementLikes).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('dislikeVideo', () => {
    it('should dislike video when dislikes are enabled', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_dislikes_enabled: true,
      });
      mockVideosService.incrementDislikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.dislikeVideo(mockRequest, mockReply);

      expect(mockVideosService.incrementDislikes).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should dislike video when body is null', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_dislikes_enabled: true,
      });
      mockVideosService.incrementDislikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: null,
      });

      await controller.dislikeVideo(mockRequest, mockReply);

      expect(mockVideosService.incrementDislikes).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===================
  // Publish/Unpublish
  // ===================
  describe('publishVideo', () => {
    it('should publish video', async () => {
      mockVideosService.publishVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.publishVideo(mockRequest, mockReply);

      expect(mockVideosService.publishVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('unpublishVideo', () => {
    it('should unpublish video', async () => {
      mockVideosService.unpublishVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.unpublishVideo(mockRequest, mockReply);

      expect(mockVideosService.unpublishVideo).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ====================
  // Source File Extension
  // ====================
  describe('setSourceFileExtension', () => {
    it('should set source file extension', async () => {
      mockVideosService.setSourceFileExtension.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { sourceFileExtension: '.mp4' },
      });

      await controller.setSourceFileExtension(mockRequest, mockReply);

      expect(mockVideosService.setSourceFileExtension).toHaveBeenCalledWith('vid-123', '.mp4');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getSourceFileExtension', () => {
    it('should get source file extension', async () => {
      mockVideosService.getSourceFileExtension.mockResolvedValue('.mp4');

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getSourceFileExtension(mockRequest, mockReply);

      expect(mockVideosService.getSourceFileExtension).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        sourceFileExtension: '.mp4',
      });
    });
  });

  // =============
  // Publishes
  // =============
  describe('getPublishes', () => {
    it('should get video publishes', async () => {
      const mockPublishes = [
        { format: 'mp4', resolution: '1080p' },
        { format: 'webm', resolution: '720p' },
      ];
      mockVideosService.getPublishes.mockResolvedValue(mockPublishes);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getPublishes(mockRequest, mockReply);

      expect(mockVideosService.getPublishes).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getPublishes.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getPublishes(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('unpublishFormatResolution', () => {
    it('should unpublish format/resolution', async () => {
      mockVideosService.unpublishFormatResolution.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });

      await controller.unpublishFormatResolution(mockRequest, mockReply);

      expect(mockVideosService.unpublishFormatResolution).toHaveBeenCalledWith(
        'vid-123',
        'mp4',
        '1080p'
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===================
  // Watch Data
  // ===================
  describe('getWatchData', () => {
    it('should get watch data for video', async () => {
      const mockWatchData = { videoId: 'vid-123', formats: ['mp4'] };
      mockVideosService.getWatchData.mockResolvedValue(mockWatchData);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getWatchData(mockRequest, mockReply);

      expect(mockVideosService.getWatchData).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getWatchData.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getWatchData(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =================
  // Tags & Recommended
  // =================
  describe('getRecommended', () => {
    it('should get recommended videos', async () => {
      const mockVideos = [{ id: 'vid-1' }, { id: 'vid-2' }];
      mockVideosService.getRecommendedVideos.mockResolvedValue(mockVideos);

      const mockRequest = createMockRequest();

      await controller.getRecommended(mockRequest, mockReply);

      expect(mockVideosService.getRecommendedVideos).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getAllTags', () => {
    it('should get all tags', async () => {
      const mockTags = ['tag1', 'tag2', 'tag3', 'tag4'];
      mockVideosService.getAllTags.mockResolvedValue(mockTags);

      const mockRequest = createMockRequest();

      await controller.getAllTags(mockRequest, mockReply);

      expect(mockVideosService.getAllTags).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===============
  // Video Data
  // ===============
  describe('getVideoData', () => {
    it('should get video data', async () => {
      const mockData = { id: 'vid-123', title: 'Test' };
      mockVideosService.getVideoData.mockResolvedValue(mockData);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideoData(mockRequest, mockReply);

      expect(mockVideosService.getVideoData).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideoData.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideoData(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAllVideosData', () => {
    it('should get all videos data', async () => {
      const mockData = [{ id: 'vid-1' }, { id: 'vid-2' }];
      mockVideosService.getAllVideosData.mockResolvedValue(mockData);

      const mockRequest = createMockRequest();

      await controller.getAllVideosData(mockRequest, mockReply);

      expect(mockVideosService.getAllVideosData).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // =======================
  // Error handling patterns
  // =======================
  describe('error handling', () => {
    it('should return 500 for service errors in getVideo', async () => {
      mockVideosService.getVideo.mockRejectedValue(new Error('DB Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });

    it('should return 500 for service errors in searchVideos', async () => {
      mockVideosService.getVideos.mockRejectedValue(new Error('Search Error'));

      const mockRequest = createMockRequest({
        query: {
          sortTerm: 'latest',
          tagLimit: 10,
          timestamp: Date.now(),
        },
      });

      await controller.searchVideos(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 for service errors in updateVideo', async () => {
      mockVideosService.updateVideo.mockRejectedValue(new Error('Update Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { title: 'New Title' },
      });

      await controller.updateVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Legacy Routes (body)
  // ======================
  describe('startPublishingFromBody', () => {
    it('should start publishing using body videoId', async () => {
      mockVideosService.setPublishing.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        body: { videoId: 'vid-456' },
      });

      await controller.startPublishingFromBody(mockRequest, mockReply);

      expect(mockVideosService.setPublishing).toHaveBeenCalledWith('vid-456', true);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.setPublishing.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ body: { videoId: 'vid-123' } });
      await controller.startPublishingFromBody(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('videoPublishedFromBody', () => {
    it('should complete publishing using body videoId', async () => {
      mockVideosService.setPublishing.mockResolvedValue(undefined);
      mockVideosService.publishVideo.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        body: { videoId: 'vid-456' },
      });

      await controller.videoPublishedFromBody(mockRequest, mockReply);

      expect(mockVideosService.setPublishing).toHaveBeenCalledWith('vid-456', false);
      expect(mockVideosService.publishVideo).toHaveBeenCalledWith('vid-456');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.setPublishing.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ body: { videoId: 'vid-123' } });
      await controller.videoPublishedFromBody(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('setErrorFromBody', () => {
    it('should set error using body videoId', async () => {
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        body: { videoId: 'vid-456' },
      });

      await controller.setErrorFromBody(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-456', true);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.setError.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ body: { videoId: 'vid-123' } });
      await controller.setErrorFromBody(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ==================
  // Report Video Tests
  // ==================
  describe('reportVideo', () => {
    it('should create video report when reports are enabled', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_reports_enabled: true,
        creation_timestamp: 1234567890,
      });
      mockReportsService.createVideoReport.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
        },
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReportsService.createVideoReport).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when reports are globally disabled', async () => {
      mockNodeSettings.isReportsEnabled = false;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
        },
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not found', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
        },
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video reports disabled', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_reports_enabled: false,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
        },
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should validate turnstile when enabled', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_reports_enabled: true,
        creation_timestamp: 1234567890,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(true);
      mockReportsService.createVideoReport.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
          cloudflareTurnstileToken: 'valid-token',
        },
        ip: '127.0.0.1',
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when turnstile token missing', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_reports_enabled: true,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
        },
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when turnstile validation fails', async () => {
      mockNodeSettings.isReportsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_reports_enabled: true,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          email: 'test@example.com',
          reportType: 'inappropriate',
          message: 'Test report',
          cloudflareTurnstileToken: 'invalid-token',
        },
        ip: '127.0.0.1',
      });

      await controller.reportVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ==================
  // Comment Tests
  // ==================
  describe('getComments', () => {
    it('should get comments for video', async () => {
      const mockComments = [
        { comment_id: 1, timestamp: 123456, comment_plain_text_sanitized: 'Comment 1' },
        { comment_id: 2, timestamp: 123457, comment_plain_text_sanitized: 'Comment 2' },
      ];
      mockCommentsService.getCommentsForVideo.mockResolvedValue(mockComments);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { type: 'before', sort: 'ascending', timestamp: 123456 },
      });

      await controller.getComments(mockRequest, mockReply);

      expect(mockCommentsService.getCommentsForVideo).toHaveBeenCalledWith(
        'vid-123',
        'before',
        'ascending',
        123456
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockCommentsService.getCommentsForVideo.mockRejectedValue(new Error('DB Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { type: 'before', sort: 'ascending', timestamp: 123456 },
      });

      await controller.getComments(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addComment', () => {
    it('should add comment when comments are enabled', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: true,
      });
      mockCommentsService.createComment.mockResolvedValue({
        comment_id: 1,
        comment_plain_text_sanitized: 'Test comment',
      });
      // Return actual comments so the map callback executes
      mockCommentsService.getCommentsForVideo.mockResolvedValue([
        { comment_id: 1, comment_plain_text_sanitized: 'Test comment', timestamp: 123456 },
      ]);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          commentPlainText: 'Test comment',
          timestamp: 123456,
        },
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockCommentsService.createComment).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when comments are globally disabled', async () => {
      mockNodeSettings.isCommentsEnabled = false;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { commentPlainText: 'Test', timestamp: 123456 },
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not found', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { commentPlainText: 'Test', timestamp: 123456 },
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video comments disabled', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: false,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { commentPlainText: 'Test', timestamp: 123456 },
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 for empty comment', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: true,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { commentPlainText: '', timestamp: 123456 },
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should validate turnstile when enabled for comments', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: true,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(true);
      mockCommentsService.createComment.mockResolvedValue({ comment_id: 1 });
      mockCommentsService.getCommentsForVideo.mockResolvedValue([]);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          commentPlainText: 'Test comment',
          timestamp: 123456,
          cloudflareTurnstileToken: 'valid-token',
        },
        ip: '127.0.0.1',
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when turnstile token missing for comments', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: true,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          commentPlainText: 'Test comment',
          timestamp: 123456,
          // missing cloudflareTurnstileToken
        },
        ip: '127.0.0.1',
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when turnstile validation fails for comments', async () => {
      mockNodeSettings.isCommentsEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_comments_enabled: true,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          commentPlainText: 'Test comment',
          timestamp: 123456,
          cloudflareTurnstileToken: 'invalid-token',
        },
        ip: '127.0.0.1',
      });

      await controller.addComment(mockRequest, mockReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteComment', () => {
    it('should delete comment', async () => {
      mockCommentsService.deleteComment.mockResolvedValue(true);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', commentId: 1 },
        query: { timestamp: 123456 },
      });

      await controller.deleteComment(mockRequest, mockReply);

      expect(mockCommentsService.deleteComment).toHaveBeenCalledWith('vid-123', 1, 123456);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when comment not found', async () => {
      mockCommentsService.deleteComment.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', commentId: 1 },
        query: { timestamp: 123456 },
      });

      await controller.deleteComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getComment', () => {
    it('should get single comment', async () => {
      const mockComment = { comment_id: 1, comment_plain_text_sanitized: 'Test' };
      mockCommentsService.getComment.mockResolvedValue(mockComment);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', commentId: 1 },
        query: { timestamp: 123456 },
      });

      await controller.getComment(mockRequest, mockReply);

      expect(mockCommentsService.getComment).toHaveBeenCalledWith('vid-123', 1, 123456);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when comment not found', async () => {
      mockCommentsService.getComment.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', commentId: 1 },
        query: { timestamp: 123456 },
      });

      await controller.getComment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =====================
  // Permission Tests
  // =====================
  describe('getVideoPermissions', () => {
    it('should get video permissions', async () => {
      const mockPermissions = {
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: true,
        isReportsEnabled: true,
      };
      mockVideosService.getPermissions.mockResolvedValue(mockPermissions);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideoPermissions(mockRequest, mockReply);

      expect(mockVideosService.getPermissions).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getPermissions.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getVideoPermissions(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateVideoPermission', () => {
    it('should update video permission', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'comments', isEnabled: true },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        isCommentsEnabled: true,
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 for invalid permission type', async () => {
      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'invalid', isEnabled: true },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle likes permission type', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'likes', isEnabled: false },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        isLikesEnabled: false,
      });
    });

    it('should handle dislikes permission type', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'dislikes', isEnabled: true },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        isDislikesEnabled: true,
      });
    });

    it('should handle reports permission type', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'reports', isEnabled: true },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        isReportsEnabled: true,
      });
    });

    it('should handle livechat permission type', async () => {
      mockVideosService.updateVideo.mockResolvedValue({ id: 'vid-123' });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'livechat', isEnabled: true },
      });

      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockVideosService.updateVideo).toHaveBeenCalledWith('vid-123', {
        isLiveChatEnabled: true,
      });
    });
  });

  // ==================
  // Dislike Tests
  // ==================
  describe('dislikeVideo', () => {
    it('should return 500 when dislikes globally disabled', async () => {
      mockNodeSettings.isDislikesEnabled = false;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.dislikeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not found', async () => {
      mockNodeSettings.isDislikesEnabled = true;
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.dislikeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video dislikes disabled', async () => {
      mockNodeSettings.isDislikesEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_dislikes_enabled: false,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.dislikeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('likeVideo', () => {
    it('should return 500 when video not found', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video likes disabled', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_likes_enabled: false,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should validate turnstile when enabled for likes', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_likes_enabled: true,
        likes: 10,
        dislikes: 2,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(true);
      mockVideosService.incrementLikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: 'valid-token' },
        ip: '127.0.0.1',
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when turnstile token missing', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {},
        ip: '127.0.0.1',
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when turnstile token is empty string', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: '' },
        ip: '127.0.0.1',
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle missing request.ip in turnstile validation', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_likes_enabled: true,
        likes: 10,
        dislikes: 2,
      });
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(true);
      mockVideosService.incrementLikes.mockResolvedValue(undefined);
      mockCloudflareService.purgeWatchPages.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: 'valid-token' },
        ip: undefined, // IP is undefined/missing
      });

      await controller.likeVideo(mockRequest, mockReply);

      // Should use empty string for IP when ip is undefined
      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalledWith('valid-token', '');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when turnstile validation fails', async () => {
      mockNodeSettings.isLikesEnabled = true;
      mockNodeSettings.isCloudflareTurnstileEnabled = true;
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(false);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: 'invalid' },
        ip: '127.0.0.1',
      });

      await controller.likeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Batch Operations
  // ======================
  describe('batchDelete', () => {
    it('should batch delete videos', async () => {
      mockVideosService.deleteVideos.mockResolvedValue({
        deletedVideoIds: ['vid-1', 'vid-2'],
        nonDeletedVideoIds: [],
      });

      const mockRequest = createMockRequest({
        body: { videoIds: ['vid-1', 'vid-2'] },
      });

      await controller.batchDelete(mockRequest, mockReply);

      expect(mockVideosService.deleteVideos).toHaveBeenCalledWith(['vid-1', 'vid-2']);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.deleteVideos.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        body: { videoIds: ['vid-1'] },
      });

      await controller.batchDelete(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('batchFinalize', () => {
    it('should batch finalize videos', async () => {
      mockVideosService.finalizeVideos.mockResolvedValue({
        finalizedVideoIds: ['vid-1', 'vid-2'],
        nonFinalizedVideoIds: [],
      });

      const mockRequest = createMockRequest({
        body: { videoIds: ['vid-1', 'vid-2'] },
      });

      await controller.batchFinalize(mockRequest, mockReply);

      expect(mockVideosService.finalizeVideos).toHaveBeenCalledWith(['vid-1', 'vid-2']);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.finalizeVideos.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        body: { videoIds: ['vid-1'] },
      });

      await controller.batchFinalize(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Video Lengths
  // ======================
  describe('setVideoLengths', () => {
    it('should set video length', async () => {
      mockVideosService.setVideoLength.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { lengthSeconds: 120, lengthTimestamp: '02:00' },
      });

      await controller.setVideoLengths(mockRequest, mockReply);

      expect(mockVideosService.setVideoLength).toHaveBeenCalledWith('vid-123', 120, '02:00');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.setVideoLength.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { lengthSeconds: 120, lengthTimestamp: '02:00' },
      });

      await controller.setVideoLengths(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Index Operations
  // ======================
  describe('markIndexOutdated', () => {
    it('should mark index as outdated', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.markIndexOutdated.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.markIndexOutdated(mockRequest, mockReply);

      expect(mockVideosService.markIndexOutdated).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.markIndexOutdated(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('writeMasterManifest', () => {
    it('should write master manifest', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.writeMasterManifest.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', manifestType: 'static' },
        body: { masterManifest: '#EXTM3U\n...' },
      });

      await controller.writeMasterManifest(mockRequest, mockReply);

      expect(mockVideosService.writeMasterManifest).toHaveBeenCalledWith(
        'vid-123',
        'static',
        '#EXTM3U\n...'
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123', manifestType: 'static' },
        body: { masterManifest: '#EXTM3U\n...' },
      });

      await controller.writeMasterManifest(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addToIndex', () => {
    it('should add video to index', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.addToIndex.mockResolvedValue({ success: true });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token-123',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockVideosService.addToIndex).toHaveBeenCalledWith('vid-123', {
        containsAdultContent: false,
        termsOfServiceAgreed: true,
        cloudflareTurnstileToken: 'token-123',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when termsOfServiceAgreed is false', async () => {
      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: false,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when cloudflareTurnstileToken missing', async () => {
      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return error status when add fails', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.addToIndex.mockResolvedValue({
        success: false,
        message: 'Failed',
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return error status with default message when message is undefined', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.addToIndex.mockResolvedValue({
        success: false,
        // message intentionally omitted to trigger null coalescing
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'Failed to add video to index',
      });
    });

    it('should return 413 when request too large', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.addToIndex.mockResolvedValue({
        success: false,
        message: 'Too large',
        isRequestTooLarge: true,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(413);
    });

    it('should return 500 when containsAdultContent is not a boolean', async () => {
      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: 'not-a-boolean',
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 'token',
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when cloudflareTurnstileToken is not a string', async () => {
      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: {
          containsAdultContent: false,
          termsOfServiceAgreed: true,
          cloudflareTurnstileToken: 12345, // not a string
        },
      });

      await controller.addToIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('removeFromIndex', () => {
    it('should remove video from index', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.removeFromIndex.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: 'token-123' },
      });

      await controller.removeFromIndex(mockRequest, mockReply);

      expect(mockVideosService.removeFromIndex).toHaveBeenCalledWith('vid-123', 'token-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { cloudflareTurnstileToken: 'token' },
      });

      await controller.removeFromIndex(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Tags
  // ======================
  describe('getTags', () => {
    it('should get published tags', async () => {
      mockVideosService.getPublishedTags.mockResolvedValue(['tag1', 'tag2']);

      const mockRequest = createMockRequest();

      await controller.getTags(mockRequest, mockReply);

      expect(mockVideosService.getPublishedTags).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on error', async () => {
      mockVideosService.getPublishedTags.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest();

      await controller.getTags(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Alias
  // ======================
  describe('getAlias', () => {
    it('should get video alias', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_indexed: true,
      });
      mockVideosService.getAliasUrl.mockResolvedValue('https://moartube.com/v/alias');

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getAlias(mockRequest, mockReply);

      expect(mockVideosService.getAliasUrl).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getAlias(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not indexed', async () => {
      mockVideosService.getVideo.mockResolvedValue({
        id: 'vid-123',
        is_indexed: false,
      });

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
      });

      await controller.getAlias(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Uploads
  // ======================
  describe('uploadVideo', () => {
    it('should return 500 for invalid params', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(false);
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'invalid', resolution: 'invalid' },
      });

      await controller.uploadVideo(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not found', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'mp4', resolution: '1080p' },
      });

      await controller.uploadVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should upload video successfully', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.trackProgress.mockReturnValue(undefined);
      mockVideoUploadService.isValidVideoMimeType.mockReturnValue(true);
      mockVideoUploadService.getVideoDestinationPath.mockReturnValue('/path/to/video.mp4');
      mockVideoUploadService.saveUploadedFile.mockResolvedValue(undefined);
      mockVideoUploadService.handleVideoUploadComplete.mockResolvedValue({ success: true });

      const mockFilePart = {
        type: 'file',
        fieldname: 'videoFile',
        mimetype: 'video/mp4',
        filename: 'video.mp4',
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'mp4', resolution: '1080p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadVideo(mockRequest, mockReply);

      expect(mockVideoUploadService.isValidVideoMimeType).toHaveBeenCalledWith('video/mp4');
      expect(mockVideoUploadService.getVideoDestinationPath).toHaveBeenCalled();
      expect(mockVideoUploadService.handleVideoUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 for invalid video mime type', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.trackProgress.mockReturnValue(undefined);
      mockVideoUploadService.isValidVideoMimeType.mockReturnValue(false);
      mockVideoUploadService.handleUploadError.mockReturnValue(undefined);
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockFilePart = {
        type: 'file',
        fieldname: 'videoFile',
        mimetype: 'text/plain',
        filename: 'file.txt',
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'mp4', resolution: '1080p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadVideo(mockRequest, mockReply);

      expect(mockVideoUploadService.handleUploadError).toHaveBeenCalledWith('vid-123');
      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 for invalid destination path', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.trackProgress.mockReturnValue(undefined);
      mockVideoUploadService.isValidVideoMimeType.mockReturnValue(true);
      mockVideoUploadService.getVideoDestinationPath.mockReturnValue('');
      mockVideoUploadService.handleUploadError.mockReturnValue(undefined);
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockFilePart = {
        type: 'file',
        fieldname: 'videoFile',
        mimetype: 'video/mp4',
        filename: 'video.mp4',
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'mp4', resolution: '1080p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadVideo(mockRequest, mockReply);

      expect(mockVideoUploadService.handleUploadError).toHaveBeenCalledWith('vid-123');
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should skip non-file parts during upload', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.trackProgress.mockReturnValue(undefined);
      mockVideoUploadService.isValidVideoMimeType.mockReturnValue(true);
      mockVideoUploadService.getVideoDestinationPath.mockReturnValue('/path/to/video.mp4');
      mockVideoUploadService.saveUploadedFile.mockResolvedValue(undefined);
      mockVideoUploadService.handleVideoUploadComplete.mockResolvedValue({ success: true });

      const mockFieldPart = {
        type: 'field', // Non-file part
        fieldname: 'metadata',
        value: 'some value',
      };

      const mockFilePart = {
        type: 'file',
        fieldname: 'videoFile',
        mimetype: 'video/mp4',
        filename: 'video.mp4',
      };

      const mockParts = [mockFieldPart, mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'mp4', resolution: '1080p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadVideo(mockRequest, mockReply);

      // Should only process the file part
      expect(mockVideoUploadService.isValidVideoMimeType).toHaveBeenCalledTimes(1);
      expect(mockVideoUploadService.handleVideoUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('uploadStream', () => {
    it('should return 500 for invalid params', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(false);
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'invalid', resolution: 'invalid' },
      });

      await controller.uploadStream(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 when video not found', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'm3u8', resolution: '720p' },
      });

      await controller.uploadStream(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should call setError and return 500 when inner processing fails', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideosService.setError.mockResolvedValue(undefined);
      mockVideoUploadService.isValidStreamMimeType.mockReturnValue(false);

      const mockFilePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'application/json', // Invalid mime type
        filename: 'segment.ts',
      };

      const asyncIterator = async function* () {
        yield mockFilePart;
      };

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'm3u8', resolution: '720p' },
        parts: vi.fn().mockReturnValue(asyncIterator()),
      });

      await controller.uploadStream(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should upload stream successfully', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidStreamMimeType.mockReturnValue(true);
      mockVideoUploadService.getStreamDestinationPath.mockReturnValue('/path/to/stream/segment.ts');
      mockVideoUploadService.saveUploadedFile.mockResolvedValue(undefined);
      mockVideoUploadService.handleStreamUploadComplete.mockReturnValue({ success: true });

      const mockFilePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'video/mp2t',
        filename: 'segment.ts',
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'm3u8', resolution: '720p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadStream(mockRequest, mockReply);

      expect(mockVideoUploadService.isValidStreamMimeType).toHaveBeenCalledWith('video/mp2t');
      expect(mockVideoUploadService.getStreamDestinationPath).toHaveBeenCalled();
      expect(mockVideoUploadService.handleStreamUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 for invalid stream destination path', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidStreamMimeType.mockReturnValue(true);
      mockVideoUploadService.getStreamDestinationPath.mockReturnValue('');
      mockVideosService.setError.mockResolvedValue(undefined);

      const mockFilePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'video/mp2t',
        filename: 'segment.ts',
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'm3u8', resolution: '720p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadStream(mockRequest, mockReply);

      expect(mockVideosService.setError).toHaveBeenCalledWith('vid-123', true);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should skip non-file parts during stream upload', async () => {
      mockVideoUploadService.validateVideoUploadParams.mockReturnValue(true);
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidStreamMimeType.mockReturnValue(true);
      mockVideoUploadService.getStreamDestinationPath.mockReturnValue('/path/to/stream.ts');
      mockVideoUploadService.saveUploadedFile.mockResolvedValue(undefined);
      mockVideoUploadService.handleStreamUploadComplete.mockResolvedValue({ success: true });

      const mockFieldPart = {
        type: 'field', // Non-file part
        fieldname: 'metadata',
        value: 'some value',
      };

      const mockFilePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'video/mp2t',
        filename: 'segment.ts',
      };

      const mockParts = [mockFieldPart, mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        query: { format: 'm3u8', resolution: '720p' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadStream(mockRequest, mockReply);

      // Should only process the file part
      expect(mockVideoUploadService.isValidStreamMimeType).toHaveBeenCalledTimes(1);
      expect(mockVideoUploadService.handleStreamUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('uploadThumbnail', () => {
    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: () => ({ next: () => ({ done: true }) }) }),
      });

      await controller.uploadThumbnail(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should upload thumbnail successfully', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidImageMimeType.mockReturnValue(true);
      mockVideoUploadService.getImageDestinationPath.mockReturnValue('/path/to/images');
      mockVideoUploadService.handleImageUploadComplete.mockResolvedValue({ success: true });

      const mockFilePart = {
        type: 'file',
        fieldname: 'thumbnailFile',
        mimetype: 'image/jpeg',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
      };

      const mockParts = [mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadThumbnail(mockRequest, mockReply);

      expect(mockVideoUploadService.isValidImageMimeType).toHaveBeenCalledWith('image/jpeg');
      expect(mockVideoUploadService.getImageDestinationPath).toHaveBeenCalledWith('vid-123', 'thumbnail');
      expect(mockVideoUploadService.handleImageUploadComplete).toHaveBeenCalledWith({
        videoId: 'vid-123',
        imageType: 'thumbnail',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 for invalid image mime type', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidImageMimeType.mockReturnValue(false);

      const mockFilePart = {
        type: 'file',
        fieldname: 'thumbnailFile',
        mimetype: 'image/png',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
      };

      const asyncIterator = async function* () {
        yield mockFilePart;
      };

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue(asyncIterator()),
      });

      await controller.uploadThumbnail(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should skip parts with non-matching fieldname', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidImageMimeType.mockReturnValue(true);
      mockVideoUploadService.getImageDestinationPath.mockReturnValue('/path/to/images');
      mockVideoUploadService.handleImageUploadComplete.mockResolvedValue({ success: true });

      const mockWrongFieldPart = {
        type: 'file',
        fieldname: 'wrongFieldName', // Wrong fieldname, should be skipped
        mimetype: 'image/jpeg',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
      };

      const mockCorrectFieldPart = {
        type: 'file',
        fieldname: 'thumbnailFile', // Correct fieldname
        mimetype: 'image/jpeg',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
      };

      const mockParts = [mockWrongFieldPart, mockCorrectFieldPart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadThumbnail(mockRequest, mockReply);

      // Should only process the correct field part
      expect(mockVideoUploadService.isValidImageMimeType).toHaveBeenCalledTimes(1);
      expect(mockVideoUploadService.handleImageUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should skip non-file parts in image upload', async () => {
      mockVideosService.getVideo.mockResolvedValue({ id: 'vid-123' });
      mockVideoUploadService.isValidImageMimeType.mockReturnValue(true);
      mockVideoUploadService.getImageDestinationPath.mockReturnValue('/path/to/images');
      mockVideoUploadService.handleImageUploadComplete.mockResolvedValue({ success: true });

      const mockFieldPart = {
        type: 'field', // Non-file part
        fieldname: 'metadata',
        value: 'some value',
      };

      const mockFilePart = {
        type: 'file',
        fieldname: 'thumbnailFile',
        mimetype: 'image/jpeg',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('image data')),
      };

      const mockParts = [mockFieldPart, mockFilePart];

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const part of mockParts) {
              yield part;
            }
          },
        }),
      });

      await controller.uploadThumbnail(mockRequest, mockReply);

      // Should only process the file part
      expect(mockVideoUploadService.isValidImageMimeType).toHaveBeenCalledTimes(1);
      expect(mockVideoUploadService.handleImageUploadComplete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('uploadPreview', () => {
    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: () => ({ next: () => ({ done: true }) }) }),
      });

      await controller.uploadPreview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('uploadPoster', () => {
    it('should return 500 when video not found', async () => {
      mockVideosService.getVideo.mockResolvedValue(null);

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        parts: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: () => ({ next: () => ({ done: true }) }) }),
      });

      await controller.uploadPoster(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ======================
  // Error Handling in Legacy Methods
  // ======================
  describe('error handling in various methods', () => {
    it('should return 500 on error in videoImported', async () => {
      mockVideosService.setImported.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.videoImported(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in stopImporting', async () => {
      mockVideosService.setImporting.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.stopImporting(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in startPublishing', async () => {
      mockVideosService.setPublishing.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.startPublishing(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in videoPublished', async () => {
      mockVideosService.setPublishing.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.videoPublished(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in stopPublishing', async () => {
      mockVideosService.setPublishing.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.stopPublishing(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in formatResolutionPublished', async () => {
      mockVideosService.markFormatResolutionPublished.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });
      await controller.formatResolutionPublished(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in videoUploaded', async () => {
      mockVideosService.notifyUploadComplete.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });
      await controller.videoUploaded(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in videoStreamed', async () => {
      mockVideosService.notifyStreamComplete.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '720p' },
      });
      await controller.videoStreamed(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in videoError', async () => {
      mockVideosService.setError.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.videoError(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in setSourceFileExtension', async () => {
      mockVideosService.setSourceFileExtension.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { sourceFileExtension: '.mp4' },
      });
      await controller.setSourceFileExtension(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getSourceFileExtension', async () => {
      mockVideosService.getSourceFileExtension.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.getSourceFileExtension(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getPublishes', async () => {
      mockVideosService.getPublishes.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.getPublishes(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in unpublishFormatResolution', async () => {
      mockVideosService.unpublishFormatResolution.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { format: 'mp4', resolution: '1080p' },
      });
      await controller.unpublishFormatResolution(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in finalizeVideo', async () => {
      mockVideosService.finalizeVideo.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.finalizeVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in incrementViews', async () => {
      mockVideosService.incrementViewsDebounced.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.incrementViews(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in publishVideo', async () => {
      mockVideosService.publishVideo.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.publishVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in unpublishVideo', async () => {
      mockVideosService.unpublishVideo.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.unpublishVideo(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getWatchData', async () => {
      mockVideosService.getWatchData.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.getWatchData(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getVideoData', async () => {
      mockVideosService.getVideoData.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.getVideoData(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getAllVideosData', async () => {
      mockVideosService.getAllVideosData.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest();
      await controller.getAllVideosData(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getRecommended', async () => {
      mockVideosService.getRecommendedVideos.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest();
      await controller.getRecommended(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getAllTags', async () => {
      mockVideosService.getAllTags.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest();
      await controller.getAllTags(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in getVideoPermissions', async () => {
      mockVideosService.getPermissions.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({ params: { videoId: 'vid-123' } });
      await controller.getVideoPermissions(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 on error in updateVideoPermission', async () => {
      mockVideosService.updateVideo.mockRejectedValue(new Error('Error'));

      const mockRequest = createMockRequest({
        params: { videoId: 'vid-123' },
        body: { type: 'comments', isEnabled: true },
      });
      await controller.updateVideoPermission(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
