/**
 * Streams Service Tests
 *
 * Tests for the StreamsService class that handles live streaming functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamsService } from '@/services/streams.js';
import type { Logger } from '@/utils/logger.js';
import type {
  VideosRepository,
  LiveChatMessagesRepository,
  CommentsRepository,
} from '@/database/repositories/index.js';
import type { WebSocketService } from '@/services/websocket.js';

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    paths: {
      videosDirectoryPath: '/data/videos',
      dataDirectoryPath: '/data',
    },
    nodeSettings: {
      storageConfig: {
        storageMode: 'filesystem',
      },
    },
  }),
}));

// Mock filesystem module
vi.mock('@/utils/filesystem.js', () => ({
  deleteDirectory: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn().mockReturnValue(''),
    appendFileSync: vi.fn(),
  },
}));

// Mock path module
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
}));

describe('StreamsService', () => {
  let service: StreamsService;
  let mockLogger: Logger;
  let mockVideosRepository: VideosRepository;
  let mockLiveChatMessagesRepository: LiveChatMessagesRepository;
  let mockCommentsRepository: CommentsRepository;
  let mockWebSocketService: WebSocketService;

  const mockVideo = {
    video_id: 'video123',
    title: 'Test Stream',
    description: 'Test Description',
    tags: 'test,stream',
    is_streaming: false,
    is_streamed: false,
    is_live: true,
    meta: '{}',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockVideosRepository = {
      findById: vi.fn(),
      findStreaming: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    } as unknown as VideosRepository;

    mockLiveChatMessagesRepository = {
      deleteByVideoId: vi.fn(),
    } as unknown as LiveChatMessagesRepository;

    mockCommentsRepository = {
      deleteByVideoId: vi.fn(),
    } as unknown as CommentsRepository;

    mockWebSocketService = {
      broadcast: vi.fn(),
      broadcastToNodes: vi.fn(),
    } as unknown as WebSocketService;

    service = new StreamsService(
      mockLogger,
      mockVideosRepository,
      mockLiveChatMessagesRepository,
      mockCommentsRepository,
      mockWebSocketService
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a StreamsService instance', () => {
      expect(service).toBeInstanceOf(StreamsService);
    });
  });

  describe('startStream', () => {
    it('should start a stream successfully', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);

      await service.startStream('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_streaming: true,
        is_streamed: false,
        is_stream_recorded_remotely: false,
        is_stream_recorded_locally: false,
        is_error: false,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Stream started', {
        videoId: 'video123',
        isRecordedRemotely: false,
        isRecordedLocally: false,
      });
    });

    it('should start a stream with recording config', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);

      await service.startStream('video123', {
        isRecordedRemotely: true,
        isRecordedLocally: true,
      });

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_streaming: true,
        is_streamed: false,
        is_stream_recorded_remotely: true,
        is_stream_recorded_locally: true,
        is_error: false,
      });
    });

    it('should throw error when video not found', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      await expect(service.startStream('nonexistent')).rejects.toThrow(
        'Video not found: nonexistent'
      );
    });

    it('should broadcast stream start event', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);

      await service.startStream('video123');

      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
        })
      );
    });
  });

  describe('stopStream', () => {
    it('should stop a stream successfully', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        is_streaming: true,
      });
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);
      vi.mocked(mockLiveChatMessagesRepository.deleteByVideoId).mockResolvedValue(5);

      await service.stopStream('video123');

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        is_streaming: false,
        is_streamed: true,
      });
      expect(mockLiveChatMessagesRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
      expect(mockLogger.info).toHaveBeenCalledWith('Stream stopped', { videoId: 'video123' });
    });

    it('should throw error when video not found', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      await expect(service.stopStream('nonexistent')).rejects.toThrow(
        'Video not found: nonexistent'
      );
    });

    it('should broadcast stream stop event', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);
      vi.mocked(mockLiveChatMessagesRepository.deleteByVideoId).mockResolvedValue(0);

      await service.stopStream('video123');

      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
        })
      );
    });
  });

  describe('getActiveStreams', () => {
    it('should return all streaming videos', async () => {
      const streamingVideos = [
        { ...mockVideo, is_streaming: true },
        { ...mockVideo, video_id: 'video456', is_streaming: true },
      ];
      vi.mocked(mockVideosRepository.findStreaming).mockResolvedValue(streamingVideos);

      const result = await service.getActiveStreams();

      expect(result).toEqual(streamingVideos);
      expect(mockVideosRepository.findStreaming).toHaveBeenCalled();
    });

    it('should return empty array when no active streams', async () => {
      vi.mocked(mockVideosRepository.findStreaming).mockResolvedValue([]);

      const result = await service.getActiveStreams();

      expect(result).toEqual([]);
    });
  });

  describe('isStreaming', () => {
    it('should return true when video is streaming', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        is_streaming: true,
      });

      const result = await service.isStreaming('video123');

      expect(result).toBe(true);
    });

    it('should return false when video is not streaming', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        is_streaming: false,
      });

      const result = await service.isStreaming('video123');

      expect(result).toBe(false);
    });

    it('should return false when video not found', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      const result = await service.isStreaming('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('startNewStream', () => {
    const streamOptions = {
      title: 'Test Stream',
      description: 'Test Description',
      tags: 'test, stream',
      rtmpPort: 1935,
      networkAddress: '192.168.1.1',
      resolution: '1280x720',
      isRecordingStreamRemotely: false,
      isRecordingStreamLocally: true,
    };

    it('should create a new stream with generated video ID', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);

      const result = await service.startNewStream(streamOptions);

      expect(result.videoId).toBeDefined();
      expect(result.videoId).toHaveLength(11);
      expect(mockVideosRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Stream',
          description: 'Test Description',
          is_streaming: true,
          is_live: true,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('New stream created', { videoId: result.videoId });
    });

    it('should resume existing stream when existingVideoId provided', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);
      vi.mocked(mockCommentsRepository.deleteByVideoId).mockResolvedValue(2);
      vi.mocked(mockLiveChatMessagesRepository.deleteByVideoId).mockResolvedValue(5);

      const result = await service.startNewStream({
        ...streamOptions,
        existingVideoId: 'video123',
      });

      expect(result.videoId).toBe('video123');
      expect(mockVideosRepository.update).toHaveBeenCalledWith(
        'video123',
        expect.objectContaining({
          title: 'Test Stream',
          is_streaming: true,
        })
      );
      expect(mockCommentsRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
      expect(mockLiveChatMessagesRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
      expect(mockLogger.info).toHaveBeenCalledWith('Stream resumed', { videoId: 'video123' });
    });

    it('should sanitize tags whitespace', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);

      await service.startNewStream({
        ...streamOptions,
        tags: '  tag1  ,  tag2  ,  tag3  ',
      });

      expect(mockVideosRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: 'tag1 , tag2 , tag3',
        })
      );
    });

    it('should broadcast video data event', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);

      await service.startNewStream(streamOptions);

      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
        })
      );
    });

    it('should regenerate video ID when collision occurs', async () => {
      // First call returns existing video (collision), second call returns null (unique)
      vi.mocked(mockVideosRepository.findById)
        .mockResolvedValueOnce(mockVideo) // First generated ID exists
        .mockResolvedValueOnce(null); // Second generated ID is unique
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);

      const result = await service.startNewStream(streamOptions);

      expect(result.videoId).toBeDefined();
      expect(mockVideosRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockVideosRepository.create).toHaveBeenCalled();
    });

    it('should copy default images when they exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);
      vi.mocked(fs.default.existsSync).mockReturnValue(true);

      await service.startNewStream(streamOptions);

      expect(fs.default.copyFileSync).toHaveBeenCalledTimes(3); // thumbnail, preview, poster
    });

    it('should handle error during directory creation', async () => {
      const { deleteDirectory } = await import('@/utils/filesystem.js');
      vi.mocked(deleteDirectory).mockRejectedValue(new Error('Permission denied'));
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      await expect(service.startNewStream(streamOptions)).rejects.toThrow('Permission denied');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create stream directories',
        expect.any(Error),
        expect.objectContaining({ videoId: expect.any(String) })
      );
    });
  });

  describe('updateStreamMeta', () => {
    it('should update stream metadata', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        meta: JSON.stringify({ rtmpPort: 1935 }),
      });
      vi.mocked(mockVideosRepository.update).mockResolvedValue(mockVideo);

      await service.updateStreamMeta('video123', {
        resolution: '1920x1080',
      });

      expect(mockVideosRepository.update).toHaveBeenCalledWith('video123', {
        meta: expect.stringContaining('"resolution":"1920x1080"'),
      });
    });

    it('should throw error when video not found', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      await expect(
        service.updateStreamMeta('nonexistent', { resolution: '1080p' })
      ).rejects.toThrow('Video not found: nonexistent');
    });
  });

  describe('getStreamMeta', () => {
    it('should return stream metadata', async () => {
      const meta = { rtmpPort: 1935, resolution: '1280x720' };
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        meta: JSON.stringify(meta),
      });

      const result = await service.getStreamMeta('video123');

      expect(result).toEqual(meta);
    });

    it('should return null when video not found', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);

      const result = await service.getStreamMeta('nonexistent');

      expect(result).toBeNull();
    });

    it('should return empty object for invalid JSON meta', async () => {
      vi.mocked(mockVideosRepository.findById).mockResolvedValue({
        ...mockVideo,
        meta: 'invalid-json',
      });

      const result = await service.getStreamMeta('video123');

      expect(result).toEqual({});
    });
  });

  describe('finalizeStreamManifests', () => {
    it('should finalize stream manifests for filesystem storage', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      service.finalizeStreamManifests('video123');

      expect(mockLogger.info).toHaveBeenCalledWith('Stream manifests finalized', {
        videoId: 'video123',
      });
    });

    it('should log finalization when directory does not exist', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      service.finalizeStreamManifests('video123');

      expect(mockLogger.info).toHaveBeenCalledWith('Stream manifests finalized', {
        videoId: 'video123',
      });
    });

    it('should end HLS manifests when directory exists with m3u8 files', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(fs.default.readdirSync).mockReturnValue(['stream.m3u8', 'master.m3u8', 'other.txt'] as unknown as string[] & { [Symbol.iterator](): IterableIterator<string>; });
      vi.mocked(fs.default.readFileSync).mockReturnValue('#EXTM3U\n#EXT-X-VERSION:3');

      service.finalizeStreamManifests('video123');

      expect(fs.default.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('stream.m3u8'),
        '\n#EXT-X-ENDLIST\n'
      );
      expect(fs.default.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('master.m3u8'),
        '\n#EXT-X-ENDLIST\n'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Stream manifests finalized', {
        videoId: 'video123',
      });
    });

    it('should not append ENDLIST if already present in manifest', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(fs.default.readdirSync).mockReturnValue(['stream.m3u8'] as unknown as string[] & { [Symbol.iterator](): IterableIterator<string>; });
      vi.mocked(fs.default.readFileSync).mockReturnValue('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST');

      service.finalizeStreamManifests('video123');

      expect(fs.default.appendFileSync).not.toHaveBeenCalled();
    });

    it('should skip HLS manifest processing for s3provider storage mode', async () => {
      const fs = await import('node:fs');
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValue({
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        nodeSettings: {
          storageConfig: {
            storageMode: 's3provider',
          },
        },
      });

      service.finalizeStreamManifests('video123');

      expect(fs.default.existsSync).not.toHaveBeenCalled();
      expect(fs.default.readdirSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Stream manifests finalized', {
        videoId: 'video123',
      });
    });
  });

  describe('startNewStream - s3provider storage mode', () => {
    const streamOptions = {
      title: 'Test Stream',
      description: 'Test Description',
      tags: 'test, stream',
      rtmpPort: 1935,
      networkAddress: '192.168.1.1',
      resolution: '1280x720',
      isRecordingStreamRemotely: false,
      isRecordingStreamLocally: true,
    };

    it('should skip filesystem directory creation for s3provider storage mode', async () => {
      const fs = await import('node:fs');
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockReturnValue({
        paths: {
          videosDirectoryPath: '/data/videos',
          dataDirectoryPath: '/data',
          publicDirectoryPath: '/public',
        },
        nodeSettings: {
          storageConfig: {
            storageMode: 's3provider',
          },
        },
      });
      vi.mocked(mockVideosRepository.findById).mockResolvedValue(null);
      vi.mocked(mockVideosRepository.create).mockResolvedValue(mockVideo);

      await service.startNewStream(streamOptions);

      expect(fs.default.mkdirSync).not.toHaveBeenCalled();
      expect(mockVideosRepository.create).toHaveBeenCalled();
    });
  });
});
