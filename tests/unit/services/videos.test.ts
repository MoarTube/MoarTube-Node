/**
 * Unit tests for VideosService
 *
 * Tests the video-related business logic including CRUD operations,
 * publishing workflows, metadata management, indexing, and view tracking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(Buffer.from('test-data')),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('test-data')),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    default: {
      ...actual,
      join: (...args: string[]) => args.join('/'),
    },
    join: (...args: string[]) => args.join('/'),
  };
});

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    nodeSettings: {
      nodeId: 'test-node-id',
      nodeName: 'Test Node',
      nodeAbout: 'Test node description',
      publicNodeProtocol: 'https',
      publicNodeAddress: 'test.example.com',
      publicNodePort: 443,
      storageConfig: {
        storageMode: 'filesystem',
      },
    },
    nodeIdentification: {
      moarTubeTokenProof: 'test-token-proof',
    },
    runtime: {
      isDevelopment: false,
    },
    paths: {
      videosDirectoryPath: '/data/videos',
      dataDirectoryPath: '/data',
      publicDirectoryPath: '/public',
    },
    urls: {
      getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
    },
    getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
  }),
}));

import { VideosService } from '@services/videos.js';
import type { Logger } from '@/utils/logger.js';

// Create mock objects
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
} as unknown as Logger;

const mockVideosRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getCount: vi.fn(),
  incrementViews: vi.fn(),
  incrementViewsBy: vi.fn(),
  incrementLikes: vi.fn(),
  incrementDislikes: vi.fn(),
  updateBandwidth: vi.fn(),
  findPendingIndexing: vi.fn(),
};

const mockCommentsRepository = {
  deleteByVideoId: vi.fn(),
};

const mockStorageService = {
  saveFile: vi.fn(),
  getFile: vi.fn(),
  deleteDirectory: vi.fn(),
};

const mockWebSocketService = {
  broadcastToNodes: vi.fn(),
};

const mockCloudflareService = {
  purgeWatchPages: vi.fn(),
  purgeEmbedVideoPages: vi.fn(),
  purgeNodePage: vi.fn(),
  purgeAllWatchPages: vi.fn(),
  purgeAllEmbedVideoPages: vi.fn(),
  purgeAdaptiveVideos: vi.fn(),
  purgeProgressiveVideos: vi.fn(),
  purgeVideo: vi.fn(),
  purgeVideoThumbnailImages: vi.fn(),
  purgeVideoPreviewImages: vi.fn(),
  purgeVideoPosterImages: vi.fn(),
};

const mockIndexerService = {
  performNodeIdentification: vi.fn(),
  submitVideoToIndex: vi.fn(),
  removeVideoFromIndex: vi.fn(),
};

describe('VideosService', () => {
  let service: VideosService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    service = new VideosService(
      mockLogger,
      mockVideosRepository as never,
      mockCommentsRepository as never,
      mockStorageService as never,
      mockWebSocketService as never,
      mockCloudflareService as never,
      mockIndexerService as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a VideosService instance', () => {
      expect(service).toBeInstanceOf(VideosService);
    });
  });

  describe('getVideo', () => {
    it('should return video when found', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        views: 100,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getVideo('video123');

      expect(result).toEqual(mockVideo);
      expect(mockVideosRepository.findById).toHaveBeenCalledWith('video123');
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getVideo('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getVideos', () => {
    it('should return paginated video results', async () => {
      const mockVideos = [
        { video_id: 'video1', title: 'Video 1' },
        { video_id: 'video2', title: 'Video 2' },
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);
      mockVideosRepository.getCount.mockResolvedValue(10);

      const result = await service.getVideos({ limit: 10 });

      expect(result).toEqual({
        data: mockVideos,
        total: 10,
        count: 2,
        limit: 10,
        hasMore: false,
      });
    });

    it('should set hasMore to true when more videos exist', async () => {
      const mockVideos = Array(10).fill({ video_id: 'video', title: 'Video' });
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);
      mockVideosRepository.getCount.mockResolvedValue(50);

      const result = await service.getVideos({ limit: 10 });

      expect(result.hasMore).toBe(true);
    });

    it('should pass filter options to repository', async () => {
      mockVideosRepository.findAll.mockResolvedValue([]);
      mockVideosRepository.getCount.mockResolvedValue(0);

      await service.getVideos({
        isPublished: true,
        sortBy: 'views',
        sortDirection: 'desc',
        search: 'test',
      });

      expect(mockVideosRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          isPublished: true,
          sortBy: 'views',
          sortDirection: 'desc',
          search: 'test',
        })
      );
    });

    it('should pass isStreaming option to repository', async () => {
      mockVideosRepository.findAll.mockResolvedValue([]);
      mockVideosRepository.getCount.mockResolvedValue(0);

      await service.getVideos({ isStreaming: true });

      expect(mockVideosRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isStreaming: true })
      );
      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ isStreaming: true })
      );
    });

    it('should pass isFinalized option to repository', async () => {
      mockVideosRepository.findAll.mockResolvedValue([]);
      mockVideosRepository.getCount.mockResolvedValue(0);

      await service.getVideos({ isFinalized: false });

      expect(mockVideosRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isFinalized: false })
      );
      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ isFinalized: false })
      );
    });

    it('should pass tagTerm option to repository', async () => {
      mockVideosRepository.findAll.mockResolvedValue([]);
      mockVideosRepository.getCount.mockResolvedValue(0);

      await service.getVideos({ tagTerm: 'gaming' });

      expect(mockVideosRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tagTerm: 'gaming' })
      );
      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ tagTerm: 'gaming' })
      );
    });

    it('should pass timestamp option to repository', async () => {
      mockVideosRepository.findAll.mockResolvedValue([]);
      mockVideosRepository.getCount.mockResolvedValue(0);
      const timestamp = Date.now();

      await service.getVideos({ timestamp });

      expect(mockVideosRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp })
      );
    });
  });

  describe('countVideos', () => {
    it('should return video count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(42);

      const result = await service.countVideos();

      expect(result).toBe(42);
    });

    it('should pass filter options to count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(5);

      await service.countVideos({ isPublished: true });

      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true })
      );
    });

    it('should pass isStreaming option to count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(3);

      await service.countVideos({ isStreaming: true });

      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ isStreaming: true })
      );
    });

    it('should pass isFinalized option to count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(10);

      await service.countVideos({ isFinalized: false });

      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ isFinalized: false })
      );
    });

    it('should pass search option to count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(2);

      await service.countVideos({ search: 'test query' });

      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test query' })
      );
    });

    it('should pass tagTerm option to count', async () => {
      mockVideosRepository.getCount.mockResolvedValue(7);

      await service.countVideos({ tagTerm: 'gaming' });

      expect(mockVideosRepository.getCount).toHaveBeenCalledWith(
        expect.objectContaining({ tagTerm: 'gaming' })
      );
    });
  });

  describe('createVideo', () => {
    it('should create a new video', async () => {
      mockVideosRepository.findById.mockResolvedValue(null); // ID doesn't exist
      mockVideosRepository.create.mockResolvedValue(undefined);

      const result = await service.createVideo({
        title: 'New Video',
        description: 'A test video',
        tags: 'tag1, tag2',
      });

      expect(result).toHaveProperty('videoId');
      expect(result.videoId).toHaveLength(11); // YouTube-like ID format
      expect(mockVideosRepository.create).toHaveBeenCalled();
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalled();
    });

    it('should retry when generated ID already exists (ID collision)', async () => {
      // First call returns existing video (collision), second returns null (unique)
      mockVideosRepository.findById
        .mockResolvedValueOnce({ video_id: 'existing123' })
        .mockResolvedValueOnce(null);
      mockVideosRepository.create.mockResolvedValue(undefined);

      const result = await service.createVideo({
        title: 'New Video',
        description: 'A test video',
        tags: 'tag1',
      });

      // Should have checked ID twice - once for collision, once for success
      expect(mockVideosRepository.findById).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('videoId');
      expect(result.videoId).toHaveLength(11);
    });

    it('should sanitize tags whitespace', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);
      mockVideosRepository.create.mockResolvedValue(undefined);

      await service.createVideo({
        title: 'New Video',
        description: 'Test',
        tags: 'tag1,   tag2,  tag3',
      });

      const createCall = mockVideosRepository.create.mock.calls[0][0];
      expect(createCall.tags).not.toContain('   ');
    });

    it('should throw when directory creation fails', async () => {
      const fs = await import('node:fs');
      mockVideosRepository.findById.mockResolvedValue(null);
      mockVideosRepository.create.mockResolvedValue(undefined);
      vi.mocked(fs.default.mkdirSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      await expect(
        service.createVideo({
          title: 'New Video',
          description: 'Test',
          tags: 'tag1',
        })
      ).rejects.toThrow('Permission denied');
    });

    it('should skip directory creation in S3 storage mode', async () => {
      const fs = await import('node:fs');
      const { getConfig } = await import('@config/index.js');
      mockVideosRepository.findById.mockResolvedValue(null);
      mockVideosRepository.create.mockResolvedValue(undefined);
      vi.mocked(fs.default.mkdirSync).mockClear();
      
      // Override config for this test
      const originalMock = vi.mocked(getConfig).getMockImplementation();
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          storageConfig: { storageMode: 's3' },
        },
        paths: { videosDirectoryPath: '/data/videos' },
      } as any);

      const result = await service.createVideo({
        title: 'New Video',
        description: 'Test',
        tags: 'tag1',
      });

      // Should create video successfully but not call mkdirSync
      expect(result).toHaveProperty('videoId');
      expect(fs.default.mkdirSync).not.toHaveBeenCalled();
      
      // Restore default mock behavior
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);
    });
  });

  describe('updateVideo', () => {
    it('should update video metadata', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Original Title',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue({ ...mockVideo, title: 'Updated Title' });

      const result = await service.updateVideo('video123', { title: 'Updated Title' });

      expect(result).toBeTruthy();
      expect(mockVideosRepository.update).toHaveBeenCalled();
      expect(mockCloudflareService.purgeWatchPages).toHaveBeenCalledWith(['video123']);
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.updateVideo('nonexistent', { title: 'Test' });

      expect(result).toBeNull();
    });

    it('should continue when Cloudflare purge fails', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);
      mockCloudflareService.purgeEmbedVideoPages.mockRejectedValueOnce(new Error('Cloudflare error'));

      const result = await service.updateVideo('video123', { title: 'Updated' });

      // Should still succeed despite Cloudflare error
      expect(result).toBeTruthy();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to purge Cloudflare cache after video update',
        expect.objectContaining({ videoId: 'video123' })
      );
    });

    it('should mark index as outdated when indexed video metadata changes', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: true,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { title: 'New Title' });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_index_outdated: true })
      );
    });

    it('should NOT mark index as outdated when non-indexed video metadata changes', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { title: 'New Title', description: 'New Desc', tags: 'new,tags' });

      // update should NOT contain is_index_outdated
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      expect(updateCall.is_index_outdated).toBeUndefined();
    });

    it('should NOT mark index as outdated when indexed video non-metadata field changes', async () => {
      // Covers the branch where is_indexed is true but we're not changing title/description/tags
      const mockVideo = {
        video_id: 'video123',
        is_indexed: true,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      // Update a non-metadata field (isHidden)
      await service.updateVideo('video123', { isHidden: true });

      // update should NOT contain is_index_outdated since we didn't change metadata
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      expect(updateCall.is_index_outdated).toBeUndefined();
      expect(updateCall.is_hidden).toBe(true);
    });

    it('should update isDislikesEnabled setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isDislikesEnabled: false });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_dislikes_enabled: false })
      );
    });

    it('should update isReportsEnabled setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isReportsEnabled: true });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_reports_enabled: true })
      );
    });

    it('should update isLiveChatEnabled setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isLiveChatEnabled: false });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_live_chat_enabled: false })
      );
    });

    it('should update isHidden setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isHidden: true });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_hidden: true })
      );
    });

    it('should update isPassworded and password settings', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isPassworded: true, password: 'secret123' });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_passworded: true, password: 'secret123' })
      );
    });

    it('should update isCommentsEnabled setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isCommentsEnabled: false });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_comments_enabled: false })
      );
    });

    it('should update isLikesEnabled setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isLikesEnabled: false });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_likes_enabled: false })
      );
    });

    it('should update description setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { description: 'New description' });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ description: 'New description' })
      );
    });

    it('should update tags setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { tags: 'tag1, tag2, tag3' });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ tags: 'tag1, tag2, tag3' })
      );
    });

    it('should update isPublished setting', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_indexed: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      await service.updateVideo('video123', { isPublished: true });

      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({ is_published: true })
      );
    });
  });

  describe('updateVideoMeta', () => {
    it('should update video meta field', async () => {
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);

      const meta = { customField: 'value' };
      await service.updateVideoMeta('video123', meta);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        meta: JSON.stringify(meta),
      });
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.updateVideoMeta('nonexistent', {});

      expect(result).toBeNull();
    });

    it('should continue when Cloudflare purge fails', async () => {
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(mockVideo);
      mockCloudflareService.purgeEmbedVideoPages.mockRejectedValueOnce(new Error('Cloudflare error'));

      const result = await service.updateVideoMeta('video123', { field: 'value' });

      expect(result).toEqual(mockVideo);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to purge Cloudflare cache after video meta update',
        expect.any(Object)
      );
    });
  });

  describe('deleteVideo', () => {
    it('should delete video and associated data', async () => {
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.delete.mockResolvedValue(true);

      const result = await service.deleteVideo('video123');

      expect(result).toBe(true);
      expect(mockCommentsRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockCloudflareService.purgeEmbedVideoPages).toHaveBeenCalledWith(['video123']);
    });

    it('should continue when Cloudflare purge fails during deletion', async () => {
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.delete.mockResolvedValue(true);
      mockCloudflareService.purgeNodePage.mockRejectedValueOnce(new Error('Cloudflare error'));

      const result = await service.deleteVideo('video123');

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to purge Cloudflare cache during video deletion',
        expect.any(Object)
      );
    });

    it('should return false when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.deleteVideo('nonexistent');

      expect(result).toBe(false);
    });

    it('should delete video from S3 when using s3 storage mode', async () => {
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.delete.mockResolvedValue(true);

      // Mock S3 storage mode
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 's3',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      const result = await service.deleteVideo('video123');

      expect(result).toBe(true);
      expect(mockStorageService.deleteDirectory).toHaveBeenCalledWith(
        'external/videos/video123'
      );
    });

    it('should skip rmSync when directory does not exist', async () => {
      const fs = await import('node:fs');
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.delete.mockResolvedValue(true);
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false);

      const result = await service.deleteVideo('video123');

      expect(result).toBe(true);
      expect(fs.default.rmSync).not.toHaveBeenCalled();
    });

    it('should log error but continue when directory deletion fails', async () => {
      const fs = await import('node:fs');
      const mockVideo = { video_id: 'video123' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.delete.mockResolvedValue(true);
      // Directory exists, so rmSync will be called and throw
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.default.rmSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      // Should not throw - deletion should still complete
      const result = await service.deleteVideo('video123');

      expect(result).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete video directories',
        expect.any(Error),
        { videoId: 'video123' }
      );
    });
  });

  describe('publishing workflow', () => {
    it('should set importing state', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setImporting('video123', true);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', { is_importing: true });
    });

    it('should set imported state', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setImported('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_importing: false,
        is_imported: true,
      });
    });

    it('should set publishing state', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setPublishing('video123', true);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', { is_publishing: true });
    });

    it('should publish video', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.publishVideo('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_publishing: false,
        is_published: true,
      });
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Video published', { videoId: 'video123' });
    });

    it('should continue when Cloudflare purge fails during publish', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockCloudflareService.purgeNodePage.mockRejectedValueOnce(new Error('Cloudflare error'));

      await service.publishVideo('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_publishing: false,
        is_published: true,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to purge Cloudflare cache after publishing',
        expect.any(Object)
      );
    });

    it('should unpublish video', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishVideo('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_published: false,
      });
      expect(mockCloudflareService.purgeAllWatchPages).toHaveBeenCalled();
    });

    it('should continue when Cloudflare purge fails during unpublish', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockCloudflareService.purgeAllEmbedVideoPages.mockRejectedValueOnce(
        new Error('Cloudflare error')
      );

      await service.unpublishVideo('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_published: false,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to purge Cloudflare cache after unpublishing',
        expect.any(Object)
      );
    });
  });

  describe('view tracking', () => {
    it('should increment views', async () => {
      mockVideosRepository.incrementViews.mockResolvedValue(undefined);

      await service.incrementViews('video123');

      expect(mockVideosRepository.incrementViews).toHaveBeenCalledWith('video123');
    });

    it('should increment views with debouncing', async () => {
      const mockVideo = { video_id: 'video123', views: 100 };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.incrementViewsDebounced('video123');

      expect(result.views).toBe(101); // 100 + 1 pending
    });

    it('should throw when video not found in debounced increment', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.incrementViewsDebounced('nonexistent')).rejects.toThrow(
        'Video not found'
      );
    });

    it('should batch multiple debounced views', async () => {
      const mockVideo = { video_id: 'video123', views: 100 };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.incrementViewsBy.mockResolvedValue(undefined);

      // Call multiple times quickly
      await service.incrementViewsDebounced('video123');
      await service.incrementViewsDebounced('video123');
      await service.incrementViewsDebounced('video123');

      // Pending views should accumulate
      const result = await service.incrementViewsDebounced('video123');
      expect(result.views).toBe(104); // 100 + 4 pending

      // Advance timers to flush
      vi.advanceTimersByTime(500);

      // Should have batched the increment
      expect(mockVideosRepository.incrementViewsBy).toHaveBeenCalledWith('video123', 4);
    });

    it('should log error when incrementViewsBy fails in debounce callback', async () => {
      const mockVideo = { video_id: 'video123', views: 100 };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.incrementViewsBy.mockRejectedValueOnce(new Error('Database error'));

      // Call to set up debounce
      await service.incrementViewsDebounced('video123');

      // Advance timers to trigger the debounce callback and run pending promises
      await vi.advanceTimersByTimeAsync(500);

      // Should have logged the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to flush pending views',
        expect.any(Error),
        { videoId: 'video123', count: 1 }
      );
    });
  });

  describe('like/dislike tracking', () => {
    it('should increment likes', async () => {
      mockVideosRepository.incrementLikes.mockResolvedValue(undefined);

      await service.incrementLikes('video123');

      expect(mockVideosRepository.incrementLikes).toHaveBeenCalledWith('video123');
    });

    it('should increment dislikes', async () => {
      mockVideosRepository.incrementDislikes.mockResolvedValue(undefined);

      await service.incrementDislikes('video123');

      expect(mockVideosRepository.incrementDislikes).toHaveBeenCalledWith('video123');
    });
  });

  describe('finalization and error states', () => {
    it('should finalize video', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.finalizeVideo('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', { is_finalized: true });
      expect(mockLogger.info).toHaveBeenCalledWith('Video finalized', { videoId: 'video123' });
    });

    it('should set error state', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setError('video123', true);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', { is_error: true });
      expect(mockLogger.warn).toHaveBeenCalledWith('Video marked as error', { videoId: 'video123' });
    });

    it('should clear error state without warning', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setError('video123', false);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', { is_error: false });
      // No warning logged when clearing error
    });
  });

  describe('indexing workflow', () => {
    it('should get videos needing indexing', async () => {
      const mockVideos = [{ video_id: 'video1' }];
      mockVideosRepository.findPendingIndexing.mockResolvedValue(mockVideos);

      const result = await service.getVideosNeedingIndexing();

      expect(result).toEqual(mockVideos);
    });

    it('should set indexed state', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setIndexed('video123', true);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_indexed: true,
        is_index_outdated: false,
        is_indexing: false,
      });
    });

    it('should set index outdated', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setIndexOutdated('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_index_outdated: true,
      });
    });

    it('should mark index outdated with cache purge for indexed videos', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.markIndexOutdated('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_index_outdated: true,
      });
      expect(mockCloudflareService.purgeVideoThumbnailImages).toHaveBeenCalledWith(['video123']);
    });

    it('should NOT update when video is not indexed', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: false };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockClear();

      await service.markIndexOutdated('video123');

      // Should not update since video is not indexed
      expect(mockVideosRepository.update).not.toHaveBeenCalled();
    });

    it('should throw when video not found for markIndexOutdated', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.markIndexOutdated('nonexistent')).rejects.toThrow(
        'Video not found: nonexistent'
      );
    });
  });

  describe('video outputs', () => {
    it('should update outputs', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      const outputs = { m3u8: ['1080p'], mp4: ['720p'] };
      await service.updateOutputs('video123', outputs);

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        outputs: JSON.stringify(outputs),
      });
    });

    it('should add output resolution', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.addOutputResolution('video123', 'm3u8', '1080p');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        outputs: expect.stringContaining('1080p'),
      });
    });

    it('should not duplicate resolution if already exists in addOutputResolution', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['1080p', '720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      // Try to add 1080p which already exists
      await service.addOutputResolution('video123', 'm3u8', '1080p');

      // Should still update, but 1080p should appear only once
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8.filter((r: string) => r === '1080p').length).toBe(1);
    });

    it('should throw when video not found for addOutputResolution', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.addOutputResolution('nonexistent', 'm3u8', '1080p')).rejects.toThrow(
        'Video not found'
      );
    });

    it('should sort resolutions descending by quality', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['480p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.addOutputResolution('video123', 'm3u8', '1080p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8[0]).toBe('1080p'); // Higher quality first
    });

    it('should handle malformed resolution in sort by treating as height 0', async () => {
      // Test that malformed resolutions are treated as height 0 by parseResolutionHeight
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['invalid'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.addOutputResolution('video123', 'm3u8', '720p');

      // 'invalid' parses to 0, '720p' parses to 720, so 720p should be first
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8[0]).toBe('720p');
      expect(outputs.m3u8[1]).toBe('invalid');
    });

    it('should remove output resolution', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['1080p', '720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.removeOutputResolution('video123', 'm3u8', '720p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).not.toContain('720p');
    });

    it('should throw when video not found for removeOutputResolution', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.removeOutputResolution('nonexistent', 'm3u8', '1080p')).rejects.toThrow(
        'Video not found'
      );
    });
  });

  describe('getPublishStatus', () => {
    it('should return publish status for all format/resolution combinations', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_published: true,
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: ['720p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getPublishStatus('video123');

      expect(result).toBeInstanceOf(Array);
      expect(result.find(p => p.format === 'm3u8' && p.resolution === '1080p')?.isPublished).toBe(true);
      expect(result.find(p => p.format === 'mp4' && p.resolution === '720p')?.isPublished).toBe(true);
      expect(result.find(p => p.format === 'webm' && p.resolution === '1080p')?.isPublished).toBe(false);
    });

    it('should throw when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.getPublishStatus('nonexistent')).rejects.toThrow('Video not found');
    });
  });

  describe('bandwidth', () => {
    it('should update bandwidth', async () => {
      mockVideosRepository.updateBandwidth.mockResolvedValue(undefined);

      await service.updateBandwidth('video123', 1000000);

      expect(mockVideosRepository.updateBandwidth).toHaveBeenCalledWith('video123', 1000000);
    });
  });

  describe('markFormatResolutionPublished', () => {
    it('should add resolution to format outputs', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.markFormatResolutionPublished('video123', 'm3u8', '1080p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).toContain('1080p');
    });

    it('should handle outputs as object (not string)', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: { m3u8: [], mp4: [], webm: [], ogv: [] }, // Already parsed object
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.markFormatResolutionPublished('video123', 'm3u8', '720p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).toContain('720p');
    });

    it('should not duplicate resolution if already exists', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.markFormatResolutionPublished('video123', 'm3u8', '1080p');

      // Should still update but not add duplicate
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8.filter((r: string) => r === '1080p').length).toBe(1);
    });

    it('should throw when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(
        service.markFormatResolutionPublished('nonexistent', 'm3u8', '1080p')
      ).rejects.toThrow('Video not found: nonexistent');
    });

    it('should sort resolutions descending when adding new resolution', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['480p', '720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      // Add 1080p which should be sorted to the front
      await service.markFormatResolutionPublished('video123', 'm3u8', '1080p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      // Should be sorted: 1080p, 720p, 480p
      expect(outputs.m3u8).toEqual(['1080p', '720p', '480p']);
    });

    it('should handle malformed resolution in sort', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['malformed'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.markFormatResolutionPublished('video123', 'm3u8', '720p');

      // Should still work without crashing
      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).toContain('720p');
    });
  });

  describe('getWatchData', () => {
    it('should return video watch data', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Test description',
        views: 100,
        likes: 10,
        dislikes: 1,
        comments: 5,
        is_published: true,
        is_publishing: false,
        is_live: false,
        is_streaming: false,
        is_streamed: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: ['720p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getWatchData('video123');

      expect(result).toBeTruthy();
      expect(result?.videoId).toBe('video123');
      expect(result?.title).toBe('Test Video');
      expect(result?.isHlsAvailable).toBe(true);
      expect(result?.isMp4Available).toBe(true);
      expect(result?.adaptiveSources).toBeInstanceOf(Array);
      expect(result?.progressiveSources).toBeInstanceOf(Array);
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getWatchData('nonexistent');

      expect(result).toBeNull();
    });

    it('should include webm progressive sources', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Test description',
        views: 100,
        likes: 10,
        dislikes: 1,
        comments: 5,
        is_published: true,
        is_publishing: false,
        is_live: false,
        is_streaming: false,
        is_streamed: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: ['720p'], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getWatchData('video123');

      expect(result).toBeTruthy();
      expect(result?.isWebmAvailable).toBe(true);
      expect(result?.progressiveSources.some(s => s.type === 'video/webm')).toBe(true);
    });

    it('should include ogv progressive sources', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Test description',
        views: 100,
        likes: 10,
        dislikes: 1,
        comments: 5,
        is_published: true,
        is_publishing: false,
        is_live: false,
        is_streaming: false,
        is_streamed: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: ['480p'] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getWatchData('video123');

      expect(result).toBeTruthy();
      expect(result?.isOgvAvailable).toBe(true);
      expect(result?.progressiveSources.some(s => s.type === 'video/ogg')).toBe(true);
    });

    it('should use dynamic manifest type when streaming', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Live Stream',
        description: 'Test description',
        views: 100,
        likes: 10,
        dislikes: 1,
        comments: 5,
        is_published: true,
        is_publishing: false,
        is_live: true,
        is_streaming: true,
        is_streamed: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getWatchData('video123');

      expect(result).toBeTruthy();
      expect(result?.videoId).toBe('video123');
      expect(result?.isHlsAvailable).toBe(true);
      // Manifest URL should contain 'dynamic' in the path when streaming
      expect(result?.adaptiveSources[0].src).toContain('/dynamic/');
    });

    it('should handle unknown video format gracefully', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Test description',
        views: 100,
        likes: 10,
        dislikes: 1,
        comments: 5,
        is_published: true,
        is_publishing: false,
        is_live: false,
        is_streaming: false,
        is_streamed: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [], unknownFormat: ['720p'] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getWatchData('video123');

      expect(result).toBeTruthy();
      // Unknown format should not appear in sources
      expect(result?.progressiveSources.length).toBe(0);
    });
  });

  describe('getPermissions', () => {
    it('should return video permissions', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_comments_enabled: true,
        is_likes_enabled: true,
        is_dislikes_enabled: false,
        is_reports_enabled: true,
        is_live_chat_enabled: false,
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getPermissions('video123');

      expect(result).toEqual({
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: false,
        isReportsEnabled: true,
        isLiveChatEnabled: false,
      });
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getPermissions('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllVideosData', () => {
    it('should return formatted data for all videos', async () => {
      const mockVideos = [
        {
          video_id: 'video1',
          title: 'Video 1',
          description: 'Description 1',
          tags: 'tag1',
          views: 100,
          is_indexed: false,
          is_published: true,
          is_live: false,
          is_streaming: false,
          is_finalized: true,
          is_stream_recorded_remotely: false,
          creation_timestamp: Date.now(),
          outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] }),
          meta: JSON.stringify({}),
        },
        {
          video_id: 'video2',
          title: 'Video 2',
          description: 'Description 2',
          tags: 'tag2',
          views: 200,
          is_indexed: false,
          is_published: false,
          is_live: true,
          is_streaming: true,
          is_finalized: false,
          is_stream_recorded_remotely: true,
          creation_timestamp: Date.now(),
          outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
          meta: JSON.stringify({}),
        },
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);

      const result = await service.getAllVideosData();

      expect(result).toHaveLength(2);
      expect(result[0].videoId).toBe('video1');
      expect(result[1].videoId).toBe('video2');
    });
  });

  describe('getVideoData', () => {
    it('should return formatted video data', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Description',
        tags: 'tag1,tag2',
        views: 100,
        is_indexed: true,
        is_published: true,
        is_live: false,
        is_streaming: false,
        is_finalized: true,
        is_stream_recorded_remotely: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: [], webm: [], ogv: [] }),
        meta: JSON.stringify({ key: 'value' }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getVideoData('video123');

      expect(result).toBeTruthy();
      expect(result?.videoId).toBe('video123');
      expect(result?.videoAliasUrl).toContain('moartu.be');
    });

    it('should return localhost alias URL in developer mode', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Description',
        tags: 'tag1,tag2',
        views: 100,
        is_indexed: true,
        is_published: true,
        is_live: false,
        is_streaming: false,
        is_finalized: true,
        is_stream_recorded_remotely: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: ['1080p'], mp4: [], webm: [], ogv: [] }),
        meta: JSON.stringify({}),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      // Mock developer mode
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: true,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 8080 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      const result = await service.getVideoData('video123');

      expect(result?.videoAliasUrl).toContain('localhost:8080');
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getVideoData('nonexistent');

      expect(result).toBeNull();
    });

    it('should show unavailable message when video not indexed', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        description: 'Description',
        tags: 'tag1,tag2',
        views: 100,
        is_indexed: false,
        is_published: true,
        is_live: false,
        is_streaming: false,
        is_finalized: true,
        is_stream_recorded_remotely: false,
        creation_timestamp: Date.now(),
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] }),
        meta: JSON.stringify({}),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getVideoData('video123');

      expect(result?.videoAliasUrl).toContain('unavailable');
    });
  });

  describe('getPublishes', () => {
    it('should return publish status for all format/resolution combinations', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_published: true,
        outputs: JSON.stringify({ m3u8: ['1080p', '720p'], mp4: ['480p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getPublishes('video123');

      expect(result).toBeTruthy();
      expect(result!.length).toBeGreaterThan(0);
      const m3u8_1080p = result!.find((p) => p.format === 'm3u8' && p.resolution === '1080p');
      expect(m3u8_1080p?.isPublished).toBe(true);
    });

    it('should handle outputs as object (not string)', async () => {
      const mockVideo = {
        video_id: 'video123',
        is_published: true,
        outputs: { m3u8: ['1080p'], mp4: [], webm: [], ogv: [] }, // Already parsed object
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getPublishes('video123');

      expect(result).toBeTruthy();
      const m3u8_1080p = result!.find((p) => p.format === 'm3u8' && p.resolution === '1080p');
      expect(m3u8_1080p?.isPublished).toBe(true);
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getPublishes('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getRecommendedVideos', () => {
    it('should return published or live videos', async () => {
      const mockVideos = [
        { video_id: 'video1', is_published: true, is_live: false },
        { video_id: 'video2', is_published: false, is_live: true },
        { video_id: 'video3', is_published: false, is_live: false },
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);

      const result = await service.getRecommendedVideos();

      expect(result).toHaveLength(2);
      expect(result.map(v => v.video_id)).toContain('video1');
      expect(result.map(v => v.video_id)).toContain('video2');
      expect(result.map(v => v.video_id)).not.toContain('video3');
    });
  });

  describe('tags', () => {
    it('should get published tags', async () => {
      const mockVideos = [
        { video_id: 'video1', is_published: true, is_live: false, tags: 'tag1,tag2' },
        { video_id: 'video2', is_published: true, is_live: false, tags: 'tag2,tag3' },
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);

      const result = await service.getPublishedTags();

      expect(result).toContain('tag1');
      expect(result).toContain('tag2');
      expect(result).toContain('tag3');
    });

    it('should get all unique tags', async () => {
      const mockVideos = [
        { video_id: 'video1', tags: 'tag1,tag2' },
        { video_id: 'video2', tags: 'tag2,tag3,tag1' },
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);

      const result = await service.getAllTags();

      expect(result).toHaveLength(3);
    });

    it('should skip empty tags and null tags field', async () => {
      const mockVideos = [
        { video_id: 'video1', tags: 'tag1,,  ,tag2' }, // empty and whitespace tags
        { video_id: 'video2', tags: null }, // null tags
        { video_id: 'video3', tags: '' }, // empty string
      ];
      mockVideosRepository.findAll.mockResolvedValue(mockVideos);

      const result = await service.getAllTags();

      // Should only contain tag1 and tag2
      expect(result).toHaveLength(2);
      expect(result).toContain('tag1');
      expect(result).toContain('tag2');
    });
  });

  describe('getAliasUrl', () => {
    it('should return alias URL for indexed video', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getAliasUrl('video123');

      expect(result).toContain('moartu.be');
      expect(result).toContain('video123');
    });

    it('should throw when video is not indexed', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: false };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      await expect(service.getAliasUrl('video123')).rejects.toThrow('Video is not indexed');
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getAliasUrl('nonexistent');

      expect(result).toBeNull();
    });

    it('should return localhost URL in developer mode', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      // Mock developer mode
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: true,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 8080 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      const result = await service.getAliasUrl('video123');

      expect(result).toBe('http://localhost:8080/nodes/test-node-id/videos/video123');
    });

    it('should throw when nodeId is not configured', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      // Mock missing nodeId
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: '',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      await expect(service.getAliasUrl('video123')).rejects.toThrow('Node ID not configured');
    });
  });

  describe('unpublishFormatResolution', () => {
    it('should remove resolution from outputs and delete files', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['1080p', '720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'm3u8', '720p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).not.toContain('720p');
    });

    it('should handle outputs as object (not string)', async () => {
      const mockVideo = {
        video_id: 'video123',
        outputs: { m3u8: ['1080p', '720p'], mp4: [], webm: [], ogv: [] }, // Already parsed object
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'm3u8', '720p');

      const updateCall = mockVideosRepository.update.mock.calls[0][1];
      const outputs = JSON.parse(updateCall.outputs);
      expect(outputs.m3u8).not.toContain('720p');
      expect(outputs.m3u8).toContain('1080p');
    });

    it('should skip file deletion when m3u8 manifest does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReset();
      vi.mocked(fs.default.unlinkSync).mockClear();
      vi.mocked(fs.default.rmSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      // manifest doesn't exist, segments dir doesn't exist
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(false);

      await service.unpublishFormatResolution('video123', 'm3u8', '720p');

      // Neither unlinkSync nor rmSync should be called
      expect(fs.default.unlinkSync).not.toHaveBeenCalled();
      expect(fs.default.rmSync).not.toHaveBeenCalled();
    });

    it('should delete only segments dir when manifest does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReset();
      vi.mocked(fs.default.unlinkSync).mockClear();
      vi.mocked(fs.default.rmSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      // manifest doesn't exist, segments dir exists
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);

      await service.unpublishFormatResolution('video123', 'm3u8', '720p');

      expect(fs.default.unlinkSync).not.toHaveBeenCalled();
      expect(fs.default.rmSync).toHaveBeenCalled();
    });

    it('should skip file operations in S3 storage mode', async () => {
      const fs = await import('node:fs');
      const { getConfig } = await import('@config/index.js');
      vi.mocked(fs.default.existsSync).mockClear();
      vi.mocked(fs.default.unlinkSync).mockClear();
      vi.mocked(fs.default.rmSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: ['720p'], mp4: [], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          storageConfig: { storageMode: 's3' },
        },
        paths: { videosDirectoryPath: '/data/videos' },
      } as any);

      await service.unpublishFormatResolution('video123', 'm3u8', '720p');

      // No filesystem operations should occur in S3 mode
      expect(fs.default.existsSync).not.toHaveBeenCalled();
      expect(fs.default.unlinkSync).not.toHaveBeenCalled();
      expect(fs.default.rmSync).not.toHaveBeenCalled();
    });

    it('should throw when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(
        service.unpublishFormatResolution('nonexistent', 'm3u8', '720p')
      ).rejects.toThrow('Video not found: nonexistent');
    });

    it('should delete progressive video files for mp4 format', async () => {
      const fs = await import('node:fs');
      // Reset and set up mocks properly
      vi.mocked(fs.default.existsSync).mockReset().mockReturnValue(true);
      vi.mocked(fs.default.unlinkSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: ['720p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'mp4', '720p');

      expect(fs.default.unlinkSync).toHaveBeenCalled();
    });

    it('should delete progressive video files for webm format', async () => {
      const fs = await import('node:fs');
      // Reset and set up mocks properly
      vi.mocked(fs.default.existsSync).mockReset().mockReturnValue(true);
      vi.mocked(fs.default.unlinkSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: ['480p'], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'webm', '480p');

      expect(fs.default.unlinkSync).toHaveBeenCalled();
    });

    it('should delete progressive video files for ogv format', async () => {
      const fs = await import('node:fs');
      // Reset and set up mocks properly
      vi.mocked(fs.default.existsSync).mockReset().mockReturnValue(true);
      vi.mocked(fs.default.unlinkSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: ['360p'] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'ogv', '360p');

      expect(fs.default.unlinkSync).toHaveBeenCalled();
    });

    it('should skip file deletion when progressive video file does not exist', async () => {
      const fs = await import('node:fs');
      // Reset and set up mocks properly
      vi.mocked(fs.default.existsSync).mockReset().mockReturnValue(false);
      vi.mocked(fs.default.unlinkSync).mockClear();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: ['720p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.unpublishFormatResolution('video123', 'mp4', '720p');

      expect(fs.default.unlinkSync).not.toHaveBeenCalled();
    });

    it('should log error but not throw when file deletion fails', async () => {
      const fs = await import('node:fs');
      // Reset and set up mocks properly
      vi.mocked(fs.default.existsSync).mockReset().mockReturnValue(true);
      vi.mocked(fs.default.unlinkSync).mockReset();
      const mockVideo = {
        video_id: 'video123',
        outputs: JSON.stringify({ m3u8: [], mp4: ['720p'], webm: [], ogv: [] }),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      vi.mocked(fs.default.unlinkSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      await service.unpublishFormatResolution('video123', 'mp4', '720p');

      // Should have logged the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete format/resolution files',
        expect.any(Error),
        expect.objectContaining({ videoId: 'video123', format: 'mp4', resolution: '720p' })
      );

      // Restore default mock behavior for subsequent tests
      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(fs.default.unlinkSync).mockReset();
    });
  });

  describe('batch operations', () => {
    it('should delete multiple videos', async () => {
      mockVideosRepository.findById.mockImplementation((id) => {
        if (id === 'video1') return Promise.resolve({ video_id: 'video1', is_importing: false, is_publishing: false, is_streaming: false, is_indexing: false, is_indexed: false });
        if (id === 'video2') return Promise.resolve({ video_id: 'video2', is_importing: true }); // In active state
        return Promise.resolve(null);
      });
      mockVideosRepository.delete.mockResolvedValue(true);

      const result = await service.deleteVideos(['video1', 'video2', 'video3']);

      expect(result.deletedVideoIds).toContain('video1');
      expect(result.nonDeletedVideoIds).toContain('video2');
      expect(result.nonDeletedVideoIds).toContain('video3');
    });

    it('should handle when video deletion returns false', async () => {
      mockVideosRepository.findById.mockResolvedValue({
        video_id: 'video1',
        is_importing: false,
        is_publishing: false,
        is_streaming: false,
        is_indexing: false,
        is_indexed: false,
      });
      mockVideosRepository.delete.mockResolvedValue(false);

      const result = await service.deleteVideos(['video1']);

      expect(result.deletedVideoIds).toHaveLength(0);
      expect(result.nonDeletedVideoIds).toContain('video1');
    });

    it('should finalize multiple videos', async () => {
      mockVideosRepository.findById.mockImplementation((id) => {
        if (id === 'video1') return Promise.resolve({ video_id: 'video1', is_importing: false, is_publishing: false, is_streaming: false, is_indexing: false, is_indexed: false });
        return Promise.resolve(null);
      });
      mockVideosRepository.update.mockResolvedValue(undefined);

      const result = await service.finalizeVideos(['video1', 'video2']);

      expect(result.finalizedVideoIds).toContain('video1');
      expect(result.nonFinalizedVideoIds).toContain('video2');
    });

    it('should skip finalization for videos in active state', async () => {
      // Test all active state conditions
      mockVideosRepository.findById.mockImplementation((id) => {
        if (id === 'video1')
          return Promise.resolve({
            video_id: 'video1',
            is_importing: true,
            is_publishing: false,
            is_streaming: false,
            is_indexing: false,
            is_indexed: false,
          });
        if (id === 'video2')
          return Promise.resolve({
            video_id: 'video2',
            is_importing: false,
            is_publishing: true,
            is_streaming: false,
            is_indexing: false,
            is_indexed: false,
          });
        if (id === 'video3')
          return Promise.resolve({
            video_id: 'video3',
            is_importing: false,
            is_publishing: false,
            is_streaming: true,
            is_indexing: false,
            is_indexed: false,
          });
        if (id === 'video4')
          return Promise.resolve({
            video_id: 'video4',
            is_importing: false,
            is_publishing: false,
            is_streaming: false,
            is_indexing: true,
            is_indexed: false,
          });
        if (id === 'video5')
          return Promise.resolve({
            video_id: 'video5',
            is_importing: false,
            is_publishing: false,
            is_streaming: false,
            is_indexing: false,
            is_indexed: true,
          });
        return Promise.resolve(null);
      });

      const result = await service.finalizeVideos([
        'video1',
        'video2',
        'video3',
        'video4',
        'video5',
      ]);

      expect(result.nonFinalizedVideoIds).toContain('video1');
      expect(result.nonFinalizedVideoIds).toContain('video2');
      expect(result.nonFinalizedVideoIds).toContain('video3');
      expect(result.nonFinalizedVideoIds).toContain('video4');
      expect(result.nonFinalizedVideoIds).toContain('video5');
      expect(result.finalizedVideoIds).toHaveLength(0);
    });
  });

  describe('writeMasterManifest', () => {
    it('should write manifest to filesystem', async () => {
      const fs = await import('node:fs');
      const content = '#EXTM3U\n#EXT-X-VERSION:3';

      await service.writeMasterManifest('video123', 'static', content);

      expect(fs.default.mkdirSync).toHaveBeenCalled();
      expect(fs.default.writeFileSync).toHaveBeenCalled();
    });

    it('should write manifest to S3 in s3 storage mode', async () => {
      const content = '#EXTM3U\n#EXT-X-VERSION:3';

      // Mock S3 storage mode
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 's3',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      await service.writeMasterManifest('video123', 'static', content);

      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        'external/videos/video123/adaptive/m3u8/manifest-master.m3u8',
        Buffer.from(content),
        'application/x-mpegURL'
      );
    });
  });

  describe('purgeVideoImageCache', () => {
    it('should purge all image caches', async () => {
      await service.purgeVideoImageCache('video123');

      expect(mockCloudflareService.purgeVideoThumbnailImages).toHaveBeenCalledWith(['video123']);
      expect(mockCloudflareService.purgeVideoPreviewImages).toHaveBeenCalledWith(['video123']);
      expect(mockCloudflareService.purgeVideoPosterImages).toHaveBeenCalledWith(['video123']);
    });
  });

  describe('getNodeIconPngBase64', () => {
    it('should return base64 encoded custom icon when exists', async () => {
      const fs = await import('node:fs');
      // Mock existsSync to return true for custom path
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(true);

      const result = service.getNodeIconPngBase64();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return base64 encoded default icon when custom does not exist', async () => {
      const fs = await import('node:fs');
      // Mock existsSync to return false for custom path
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false);

      const result = service.getNodeIconPngBase64();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getNodeAvatarPngBase64', () => {
    it('should return base64 encoded custom avatar when exists', async () => {
      const fs = await import('node:fs');
      // Mock existsSync to return true for custom path
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(true);

      const result = service.getNodeAvatarPngBase64();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return base64 encoded default avatar when custom does not exist', async () => {
      const fs = await import('node:fs');
      // Mock existsSync to return false for custom path
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false);

      const result = service.getNodeAvatarPngBase64();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getVideoPreviewJpgBase64', () => {
    it('should return base64 encoded preview from filesystem', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.default.readFileSync).mockReturnValueOnce(Buffer.from('preview-data'));

      const result = await service.getVideoPreviewJpgBase64('video123');

      expect(typeof result).toBe('string');
      expect(result).toBe(Buffer.from('preview-data').toString('base64'));
    });

    it('should throw when preview not found on filesystem', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false);

      await expect(service.getVideoPreviewJpgBase64('video123')).rejects.toThrow(
        'Video preview image not found'
      );
    });

    it('should return base64 encoded preview from S3', async () => {
      // Mock S3 storage mode
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 's3',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token-proof',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);
      mockStorageService.getFile.mockResolvedValue(Buffer.from('s3-preview-data'));

      const result = await service.getVideoPreviewJpgBase64('video123');

      expect(result).toBe(Buffer.from('s3-preview-data').toString('base64'));
      expect(mockStorageService.getFile).toHaveBeenCalledWith(
        'external/videos/video123/images/preview.jpg'
      );
    });
  });

  describe('addToIndex', () => {
    it('should add video to MoarTube index', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        tags: 'tag1,tag2',
        views: 100,
        is_live: false,
        is_streaming: false,
        is_published: true,
        length_seconds: 300,
        creation_timestamp: Date.now(),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);
      mockIndexerService.submitVideoToIndex.mockResolvedValue({ isError: false });
      mockStorageService.getFile.mockResolvedValue(Buffer.from('preview-data'));

      const result = await service.addToIndex('video123', {
        termsOfServiceAgreed: true,
        containsAdultContent: false,
        cloudflareTurnstileToken: 'token123',
      });

      expect(result.success).toBe(true);
      expect(mockIndexerService.submitVideoToIndex).toHaveBeenCalled();
    });

    it('should throw when terms not agreed', async () => {
      const mockVideo = { video_id: 'video123', is_published: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      await expect(
        service.addToIndex('video123', {
          termsOfServiceAgreed: false,
          containsAdultContent: false,
          cloudflareTurnstileToken: 'token',
        })
      ).rejects.toThrow('Terms of service must be agreed to');
    });

    it('should throw when video not published or live', async () => {
      const mockVideo = { video_id: 'video123', is_published: false, is_live: false };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      await expect(
        service.addToIndex('video123', {
          termsOfServiceAgreed: true,
          containsAdultContent: false,
          cloudflareTurnstileToken: 'token',
        })
      ).rejects.toThrow('Video must be published or live to be indexed');
    });

    it('should return error when indexer returns error', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        tags: 'tag1,tag2',
        views: 100,
        is_live: false,
        is_streaming: false,
        is_published: true,
        length_seconds: 300,
        creation_timestamp: Date.now(),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);
      mockIndexerService.submitVideoToIndex.mockResolvedValue({
        isError: true,
        message: 'Indexer failed',
      });
      mockStorageService.getFile.mockResolvedValue(Buffer.from('preview-data'));

      const result = await service.addToIndex('video123', {
        termsOfServiceAgreed: true,
        containsAdultContent: false,
        cloudflareTurnstileToken: 'token123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Indexer failed');
    });

    it('should return isRequestTooLarge when indexer returns 413', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        tags: 'tag1,tag2',
        views: 100,
        is_live: false,
        is_streaming: false,
        is_published: true,
        length_seconds: 300,
        creation_timestamp: Date.now(),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);
      mockIndexerService.submitVideoToIndex.mockResolvedValue({
        isError: true,
        statusCode: 413,
        message: 'Request too large',
      });
      mockStorageService.getFile.mockResolvedValue(Buffer.from('preview-data'));

      const result = await service.addToIndex('video123', {
        termsOfServiceAgreed: true,
        containsAdultContent: false,
        cloudflareTurnstileToken: 'token123',
      });

      expect(result.success).toBe(false);
      expect(result.isRequestTooLarge).toBe(true);
    });

    it('should throw when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(
        service.addToIndex('nonexistent', {
          termsOfServiceAgreed: true,
          containsAdultContent: false,
          cloudflareTurnstileToken: 'token',
        })
      ).rejects.toThrow('Video not found');
    });

    it('should throw when node identification fails', async () => {
      const mockVideo = {
        video_id: 'video123',
        title: 'Test Video',
        tags: 'tag1',
        views: 0,
        is_live: false,
        is_streaming: false,
        is_published: true,
        length_seconds: 100,
        creation_timestamp: Date.now(),
      };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);
      mockStorageService.getFile.mockResolvedValue(Buffer.from('preview-data'));

      // Mock missing token proof
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: '',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      await expect(
        service.addToIndex('video123', {
          termsOfServiceAgreed: true,
          containsAdultContent: false,
          cloudflareTurnstileToken: 'token',
        })
      ).rejects.toThrow('Node identification failed - no token proof');
    });
  });

  describe('removeFromIndex', () => {
    it('should remove video from MoarTube index', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);
      mockIndexerService.removeVideoFromIndex.mockResolvedValue(undefined);

      await service.removeFromIndex('video123', 'turnstile-token');

      expect(mockIndexerService.removeVideoFromIndex).toHaveBeenCalled();
      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_indexed: false,
        is_index_outdated: false,
      });
    });

    it('should throw when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      await expect(service.removeFromIndex('nonexistent', 'turnstile-token')).rejects.toThrow(
        'Video not found'
      );
    });

    it('should throw when node identification fails', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockIndexerService.performNodeIdentification.mockResolvedValue(undefined);

      // Mock missing token proof
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValueOnce({
        nodeSettings: {
          nodeId: 'test-node-id',
          nodeName: 'Test Node',
          nodeAbout: 'Test node description',
          publicNodeProtocol: 'https',
          publicNodeAddress: 'test.example.com',
          publicNodePort: 443,
          storageConfig: {
            storageMode: 'filesystem',
          },
        },
        nodeIdentification: {
          moarTubeTokenProof: '',
        },
        runtime: {
          isDevelopment: false,
        },
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        urls: {
          getAliaserConfig: vi.fn().mockReturnValue({ port: 3000 }),
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://cdn.example.com'),
      } as any);

      await expect(service.removeFromIndex('video123', 'turnstile-token')).rejects.toThrow(
        'Node identification failed - no token proof'
      );
    });
  });

  describe('setVideoLength', () => {
    it('should update video length', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: false };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setVideoLength('video123', 300, '5:00');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        length_seconds: 300,
        length_timestamp: '5:00',
      });
    });

    it('should mark index outdated when video is indexed', async () => {
      const mockVideo = { video_id: 'video123', is_indexed: true };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setVideoLength('video123', 300, '5:00');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        length_seconds: 300,
        length_timestamp: '5:00',
        is_index_outdated: true,
      });
    });
  });

  describe('setSourceFileExtension', () => {
    it('should update source file extension', async () => {
      mockVideosRepository.update.mockResolvedValue(undefined);

      await service.setSourceFileExtension('video123', 'mp4');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        source_file_extension: 'mp4',
      });
    });
  });

  describe('getSourceFileExtension', () => {
    it('should return source file extension', async () => {
      const mockVideo = { video_id: 'video123', source_file_extension: 'mp4' };
      mockVideosRepository.findById.mockResolvedValue(mockVideo);

      const result = await service.getSourceFileExtension('video123');

      expect(result).toBe('mp4');
    });

    it('should return null when video not found', async () => {
      mockVideosRepository.findById.mockResolvedValue(null);

      const result = await service.getSourceFileExtension('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('notifyUploadComplete', () => {
    it('should log upload completion', async () => {
      await service.notifyUploadComplete('video123', 'm3u8', '1080p');

      expect(mockLogger.debug).toHaveBeenCalledWith('Upload complete notification', {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
      });
    });
  });

  describe('notifyStreamComplete', () => {
    it('should log stream completion', async () => {
      await service.notifyStreamComplete('video123', 'm3u8', '720p');

      expect(mockLogger.debug).toHaveBeenCalledWith('Stream complete notification', {
        videoId: 'video123',
        format: 'm3u8',
        resolution: '720p',
      });
    });
  });
});
