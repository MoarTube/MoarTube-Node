/**
 * Video Upload Service Tests
 *
 * Tests for the VideoUploadService class that handles video and image uploads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoUploadService } from '@/services/video-upload.js';
import type { Logger } from '@/utils/logger.js';
import type { VideosService } from '@/services/videos.js';
import type { WebSocketService } from '@/services/websocket.js';
import type { UploadTrackerService } from '@/services/upload-tracker.js';
import type { CloudflareService } from '@/services/cloudflare.js';

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    paths: {
      videosDirectoryPath: '/data/videos',
    },
  }),
}));

// Mock path module to work cross-platform
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

// Mock node:fs - use import * as fs pattern
vi.mock('node:fs', () => {
  const mockMkdirSync = vi.fn();
  const mockWriteFileSync = vi.fn();
  const mockExistsSync = vi.fn().mockReturnValue(true);

  return {
    default: {
      mkdirSync: mockMkdirSync,
      writeFileSync: mockWriteFileSync,
      existsSync: mockExistsSync,
    },
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
  };
});

import * as fs from 'node:fs';

describe('VideoUploadService', () => {
  let service: VideoUploadService;
  let mockLogger: Logger;
  let mockVideosService: VideosService;
  let mockUploadTrackerService: UploadTrackerService;
  let mockCloudflareService: CloudflareService;
  let mockWebSocketService: WebSocketService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockVideosService = {
      getVideoById: vi.fn(),
      updateVideo: vi.fn(),
      markIndexOutdated: vi.fn().mockResolvedValue(undefined),
    } as unknown as VideosService;

    mockUploadTrackerService = {
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      updateProgress: vi.fn(),
      isTracking: vi.fn(),
      isStopping: vi.fn(),
      addRequest: vi.fn(),
      completeStop: vi.fn(),
    } as unknown as UploadTrackerService;

    mockCloudflareService = {
      isEnabled: vi.fn().mockReturnValue(false),
      purgeProgressiveVideos: vi.fn().mockResolvedValue(undefined),
      purgeAdaptiveVideos: vi.fn().mockResolvedValue(undefined),
      purgeNodePage: vi.fn().mockResolvedValue(undefined),
      purgeAllWatchPages: vi.fn().mockResolvedValue(undefined),
      purgeVideoThumbnailImages: vi.fn().mockResolvedValue(undefined),
      purgeVideoPreviewImages: vi.fn().mockResolvedValue(undefined),
      purgeVideoPosterImages: vi.fn().mockResolvedValue(undefined),
    } as unknown as CloudflareService;

    mockWebSocketService = {
      broadcastToNodes: vi.fn(),
      echo: vi.fn(),
    } as unknown as WebSocketService;

    service = new VideoUploadService(
      mockVideosService,
      mockUploadTrackerService,
      mockCloudflareService,
      mockWebSocketService,
      mockLogger
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a VideoUploadService instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('validateVideoUploadParams', () => {
    it('should return true for valid format and resolution', () => {
      expect(service.validateVideoUploadParams('mp4', '1080p')).toBe(true);
      expect(service.validateVideoUploadParams('m3u8', '720p')).toBe(true);
      expect(service.validateVideoUploadParams('webm', '480p')).toBe(true);
      expect(service.validateVideoUploadParams('ogv', '360p')).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(service.validateVideoUploadParams('avi', '1080p')).toBe(false);
      expect(service.validateVideoUploadParams('mkv', '720p')).toBe(false);
    });

    it('should return false for invalid resolution', () => {
      expect(service.validateVideoUploadParams('mp4', '4k')).toBe(false);
      expect(service.validateVideoUploadParams('mp4', '480')).toBe(false);
    });

    it('should validate all supported formats', () => {
      const formats = ['m3u8', 'mp4', 'webm', 'ogv'];
      for (const format of formats) {
        expect(service.validateVideoUploadParams(format, '1080p')).toBe(true);
      }
    });

    it('should validate all supported resolutions', () => {
      const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
      for (const resolution of resolutions) {
        expect(service.validateVideoUploadParams('mp4', resolution)).toBe(true);
      }
    });
  });

  describe('getVideoDestinationPath', () => {
    it('should return path for mp4 format', () => {
      const result = service.getVideoDestinationPath('video123', 'mp4', '1080p', 'video.mp4');

      expect(result).toBe('/data/videos/video123/progressive/mp4');
    });

    it('should return path for webm format', () => {
      const result = service.getVideoDestinationPath('video123', 'webm', '720p', 'video.webm');

      expect(result).toBe('/data/videos/video123/progressive/webm');
    });

    it('should return path for ogv format', () => {
      const result = service.getVideoDestinationPath('video123', 'ogv', '480p', 'video.ogv');

      expect(result).toBe('/data/videos/video123/progressive/ogv');
    });

    it('should return path for m3u8 manifest file', () => {
      const result = service.getVideoDestinationPath(
        'video123',
        'm3u8',
        '1080p',
        'manifest-1080p.m3u8'
      );

      expect(result).toBe('/data/videos/video123/adaptive/m3u8');
    });

    it('should return path for m3u8 segment file', () => {
      const result = service.getVideoDestinationPath('video123', 'm3u8', '1080p', 'segment-0001.ts');

      expect(result).toBe('/data/videos/video123/adaptive/m3u8/1080p');
    });

    it('should return null for invalid m3u8 filename', () => {
      const result = service.getVideoDestinationPath(
        'video123',
        'm3u8',
        '1080p',
        'invalid-file.txt'
      );

      expect(result).toBeNull();
    });

    it('should return null for unsupported format', () => {
      const result = service.getVideoDestinationPath('video123', 'avi', '1080p', 'video.avi');

      expect(result).toBeNull();
    });
  });

  describe('getStreamDestinationPath', () => {
    it('should return path for m3u8 manifest file', () => {
      const result = service.getStreamDestinationPath(
        'video123',
        'm3u8',
        '1080p',
        'manifest-1080p.m3u8'
      );

      expect(result).toBe('/data/videos/video123/adaptive/m3u8');
    });

    it('should return path for m3u8 segment file', () => {
      const result = service.getStreamDestinationPath(
        'video123',
        'm3u8',
        '720p',
        'segment-0001.ts'
      );

      expect(result).toBe('/data/videos/video123/adaptive/m3u8/720p');
    });

    it('should return null for invalid filename', () => {
      const result = service.getStreamDestinationPath('video123', 'm3u8', '1080p', 'invalid.mp4');

      expect(result).toBeNull();
    });

    it('should return null for non-m3u8 format', () => {
      const result = service.getStreamDestinationPath('video123', 'mp4', '1080p', 'video.mp4');

      expect(result).toBeNull();
    });
  });

  describe('getImageDestinationPath', () => {
    it('should return images directory for thumbnail', () => {
      const result = service.getImageDestinationPath('video123', 'thumbnail');

      expect(result).toBe('/data/videos/video123/images');
    });

    it('should return images directory for preview', () => {
      const result = service.getImageDestinationPath('video123', 'preview');

      expect(result).toBe('/data/videos/video123/images');
    });

    it('should return images directory for poster', () => {
      const result = service.getImageDestinationPath('video123', 'poster');

      expect(result).toBe('/data/videos/video123/images');
    });
  });

  describe('isValidVideoMimeType', () => {
    it('should return true for valid video mime types', () => {
      expect(service.isValidVideoMimeType('video/mp4')).toBe(true);
      expect(service.isValidVideoMimeType('video/webm')).toBe(true);
      expect(service.isValidVideoMimeType('video/ogg')).toBe(true);
      expect(service.isValidVideoMimeType('video/mp2t')).toBe(true);
      expect(service.isValidVideoMimeType('application/vnd.apple.mpegurl')).toBe(true);
    });

    it('should return false for invalid video mime types', () => {
      expect(service.isValidVideoMimeType('video/avi')).toBe(false);
      expect(service.isValidVideoMimeType('audio/mp3')).toBe(false);
      expect(service.isValidVideoMimeType('text/plain')).toBe(false);
    });
  });

  describe('isValidStreamMimeType', () => {
    it('should return true for valid stream mime types', () => {
      expect(service.isValidStreamMimeType('application/vnd.apple.mpegurl')).toBe(true);
      expect(service.isValidStreamMimeType('video/mp2t')).toBe(true);
    });

    it('should return false for invalid stream mime types', () => {
      expect(service.isValidStreamMimeType('video/mp4')).toBe(false);
      expect(service.isValidStreamMimeType('video/webm')).toBe(false);
    });
  });

  describe('isValidImageMimeType', () => {
    it('should return true for jpeg mime type', () => {
      expect(service.isValidImageMimeType('image/jpeg')).toBe(true);
    });

    it('should return false for other image mime types', () => {
      expect(service.isValidImageMimeType('image/png')).toBe(false);
      expect(service.isValidImageMimeType('image/gif')).toBe(false);
      expect(service.isValidImageMimeType('image/webp')).toBe(false);
    });
  });

  describe('isValidSegmentName', () => {
    it('should return true for valid segment filenames', () => {
      expect(service.isValidSegmentName('segment-0001.ts')).toBe(true);
      expect(service.isValidSegmentName('0.ts')).toBe(true);
      expect(service.isValidSegmentName('output0001.ts')).toBe(true);
      expect(service.isValidSegmentName('seg_001.ts')).toBe(true);
    });

    it('should return false for invalid segment filenames', () => {
      expect(service.isValidSegmentName('segment.mp4')).toBe(false);
      expect(service.isValidSegmentName('invalid file.ts')).toBe(false);
      expect(service.isValidSegmentName('.ts')).toBe(false);
    });
  });

  describe('handleVideoUploadComplete', () => {
    it('should complete video upload for mp4 format successfully', async () => {
      const result = await service.handleVideoUploadComplete({
        videoId: 'video123',
        format: 'mp4',
        resolution: '1080p',
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('video123');
      expect(result.format).toBe('mp4');
      expect(result.resolution).toBe('1080p');
      expect(mockUploadTrackerService.stopTracking).toHaveBeenCalledWith('video123');
      expect(mockCloudflareService.purgeProgressiveVideos).toHaveBeenCalledWith('video123');
    });

    it('should complete video upload for m3u8 format and purge adaptive videos', async () => {
      const result = await service.handleVideoUploadComplete({
        videoId: 'video123',
        format: 'm3u8',
        resolution: '720p',
      });

      expect(result.success).toBe(true);
      expect(mockCloudflareService.purgeAdaptiveVideos).toHaveBeenCalledWith('video123');
    });

    it('should complete video upload for webm format', async () => {
      const result = await service.handleVideoUploadComplete({
        videoId: 'video123',
        format: 'webm',
        resolution: '480p',
      });

      expect(result.success).toBe(true);
      expect(mockCloudflareService.purgeProgressiveVideos).toHaveBeenCalledWith('video123');
    });

    it('should return error result when cloudflare purge fails', async () => {
      vi.mocked(mockCloudflareService.purgeProgressiveVideos).mockRejectedValue(
        new Error('Cloudflare error')
      );

      const result = await service.handleVideoUploadComplete({
        videoId: 'video123',
        format: 'mp4',
        resolution: '1080p',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cloudflare error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log info when upload completes successfully', async () => {
      await service.handleVideoUploadComplete({
        videoId: 'video123',
        format: 'ogv',
        resolution: '360p',
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Video upload completed', {
        videoId: 'video123',
        format: 'ogv',
        resolution: '360p',
      });
    });
  });

  describe('handleStreamUploadComplete', () => {
    it('should complete stream upload successfully', () => {
      const result = service.handleStreamUploadComplete({
        videoId: 'video123',
        format: 'm3u8',
        resolution: '1080p',
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('video123');
      expect(result.format).toBe('m3u8');
      expect(result.resolution).toBe('1080p');
    });

    it('should log debug message on completion', () => {
      service.handleStreamUploadComplete({
        videoId: 'video456',
        format: 'm3u8',
        resolution: '720p',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Stream upload completed', {
        videoId: 'video456',
        format: 'm3u8',
        resolution: '720p',
      });
    });
  });

  describe('handleImageUploadComplete', () => {
    it('should complete thumbnail upload and purge cache', async () => {
      const result = await service.handleImageUploadComplete({
        videoId: 'video123',
        imageType: 'thumbnail',
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('video123');
      expect(mockCloudflareService.purgeVideoThumbnailImages).toHaveBeenCalledWith(['video123']);
    });

    it('should complete preview upload, mark index outdated, and purge cache', async () => {
      const result = await service.handleImageUploadComplete({
        videoId: 'video123',
        imageType: 'preview',
      });

      expect(result.success).toBe(true);
      expect(mockVideosService.markIndexOutdated).toHaveBeenCalledWith('video123');
      expect(mockCloudflareService.purgeVideoPreviewImages).toHaveBeenCalledWith(['video123']);
    });

    it('should complete poster upload and purge cache', async () => {
      const result = await service.handleImageUploadComplete({
        videoId: 'video123',
        imageType: 'poster',
      });

      expect(result.success).toBe(true);
      expect(mockCloudflareService.purgeVideoPosterImages).toHaveBeenCalledWith(['video123']);
    });

    it('should return error result when image upload fails', async () => {
      (mockCloudflareService.purgeVideoThumbnailImages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Purge failed')
      );

      const result = await service.handleImageUploadComplete({
        videoId: 'video123',
        imageType: 'thumbnail',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Purge failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log info when image upload completes successfully', async () => {
      await service.handleImageUploadComplete({
        videoId: 'video123',
        imageType: 'poster',
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Image upload completed', {
        videoId: 'video123',
        imageType: 'poster',
      });
    });
  });

  describe('trackProgress', () => {
    let mockRequest: any;
    let dataHandler: (chunk: Buffer) => void;

    beforeEach(() => {
      mockRequest = {
        headers: {
          'content-length': '1000',
        },
        raw: {
          on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
            if (event === 'data') {
              dataHandler = handler;
            }
          }),
        },
      };
    });

    it('should start tracking and add request', () => {
      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      expect(mockUploadTrackerService.startTracking).toHaveBeenCalledWith(
        'video123',
        'mp4',
        '1080p'
      );
      expect(mockUploadTrackerService.addRequest).toHaveBeenCalledWith('video123', mockRequest);
    });

    it('should not track if content-length is 0', () => {
      mockRequest.headers['content-length'] = '0';

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      expect(mockUploadTrackerService.startTracking).not.toHaveBeenCalled();
    });

    it('should not track if content-length is missing', () => {
      mockRequest.headers = {};

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      expect(mockUploadTrackerService.startTracking).not.toHaveBeenCalled();
    });

    it('should update progress on data event', () => {
      vi.mocked(mockUploadTrackerService.isStopping).mockReturnValue(false);

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      // Simulate receiving data
      dataHandler(Buffer.alloc(500));

      expect(mockUploadTrackerService.updateProgress).toHaveBeenCalled();
    });

    it('should skip progress update when stopping', () => {
      vi.mocked(mockUploadTrackerService.isStopping).mockReturnValue(true);

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      // Simulate receiving data
      dataHandler(Buffer.alloc(500));

      expect(mockUploadTrackerService.updateProgress).not.toHaveBeenCalled();
    });

    it('should broadcast progress via websocket', () => {
      vi.mocked(mockUploadTrackerService.isStopping).mockReturnValue(false);
      vi.spyOn(Date, 'now').mockReturnValue(0);

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      // Simulate receiving all data (100%)
      dataHandler(Buffer.alloc(1000));

      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith({
        eventName: 'echo',
        data: {
          eventName: 'video_status',
          payload: {
            type: 'publishing',
            videoId: 'video123',
            format: 'mp4',
            resolution: '1080p',
            progress: 100,
          },
        },
      });
    });

    it('should broadcast when progress reaches 100 even if time threshold not met', () => {
      // Test the 'uploadProgress === 100' branch when time condition is false
      vi.mocked(mockUploadTrackerService.isStopping).mockReturnValue(false);

      // Set time to a fixed value, then set lastBroadcastTime to same value
      // so now - lastBroadcastTime > 1000 is false
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // Return same time each call so time difference is 0
        return 5000;
      });

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      // First chunk - triggers broadcast because time diff > 1000 (initial lastBroadcastTime is 0)
      dataHandler(Buffer.alloc(100));

      // Reset to simulate same time (time diff = 0, not > 1000)
      // But receive remaining data to hit 100% progress
      dataHandler(Buffer.alloc(900)); // Total 1000 bytes = 100%

      // Should have broadcast twice - first due to time, second due to 100%
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledTimes(2);

      // Second call should be at 100%
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenLastCalledWith({
        eventName: 'echo',
        data: {
          eventName: 'video_status',
          payload: {
            type: 'publishing',
            videoId: 'video123',
            format: 'mp4',
            resolution: '1080p',
            progress: 100,
          },
        },
      });
    });

    it('should not broadcast when progress < 100 and time threshold not met', () => {
      vi.mocked(mockUploadTrackerService.isStopping).mockReturnValue(false);

      // First call will set lastBroadcastTime
      vi.spyOn(Date, 'now').mockReturnValue(5000);

      service.trackProgress(mockRequest, 'video123', 'mp4', '1080p');

      // First chunk - time diff is 5000 > 1000, so broadcasts
      dataHandler(Buffer.alloc(100));
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledTimes(1);

      // Second chunk at same time - time diff is 0, not > 1000, progress < 100
      // Should NOT broadcast
      dataHandler(Buffer.alloc(100));
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleUploadError', () => {
    it('should complete stop on error', () => {
      service.handleUploadError('video123');

      expect(mockUploadTrackerService.completeStop).toHaveBeenCalledWith('video123');
    });
  });

  describe('saveUploadedFile', () => {
    it('should create directory and save file', async () => {
      const mockFile = {
        filename: 'video.mp4',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('video content')),
      };

      await service.saveUploadedFile(mockFile as any, '/data/videos/video123/progressive/mp4');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/data/videos/video123/progressive/mp4', {
        recursive: true,
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/data/videos/video123/progressive/mp4/video.mp4',
        Buffer.from('video content')
      );
    });

    it('should log debug message after saving file', async () => {
      const mockFile = {
        filename: 'segment.ts',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('segment data')),
      };

      await service.saveUploadedFile(mockFile as any, '/data/videos/video123/adaptive/m3u8/1080p');

      expect(mockLogger.debug).toHaveBeenCalledWith('Saved uploaded file', {
        filename: 'segment.ts',
        path: '/data/videos/video123/adaptive/m3u8/1080p/segment.ts',
      });
    });
  });
});
