/**
 * Video Upload Service
 *
 * Handles video and image file uploads with validation,
 * progress tracking, and WebSocket broadcasting.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

import { getConfig } from '../config/index.js';
import { type Logger } from '../utils/logger.js';
import type { IVideoService, IWebSocketService } from './interfaces.js';
import type { IUploadTrackerService } from './upload-tracker.js';
import { type CloudflareService } from './cloudflare.js';
import { type WebSocketService } from './websocket.js';

// ============================================================================
// Types
// ============================================================================

export type ImageType = 'thumbnail' | 'preview' | 'poster';

export interface UploadResult {
  success: boolean;
  videoId: string;
  format?: string;
  resolution?: string;
  error?: string;
}

export interface VideoUploadOptions {
  videoId: string;
  format: string;
  resolution: string;
}

export interface StreamUploadOptions {
  videoId: string;
  format: string;
  resolution: string;
}

export interface ImageUploadOptions {
  videoId: string;
  imageType: ImageType;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_VIDEO_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl', // m3u8 manifest
  'video/mp2t', // TS segments
  'video/mp4',
  'video/webm',
  'video/ogg',
]);

const VALID_STREAM_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl', // m3u8 manifest
  'video/mp2t', // TS segments
]);

const VALID_IMAGE_MIME_TYPES = new Set(['image/jpeg']);

const VALID_FORMATS = new Set(['m3u8', 'mp4', 'webm', 'ogv']);
const VALID_RESOLUTIONS = new Set(['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p']);

// ============================================================================
// Service
// ============================================================================

export interface IVideoUploadService {
  /** Validate video upload parameters */
  validateVideoUploadParams(format: string, resolution: string): boolean;

  /** Get destination path for a video upload */
  getVideoDestinationPath(
    videoId: string,
    format: string,
    resolution: string,
    filename: string
  ): string | null;

  /** Get destination path for a stream upload */
  getStreamDestinationPath(
    videoId: string,
    format: string,
    resolution: string,
    filename: string
  ): string | null;

  /** Get destination path for an image upload */
  getImageDestinationPath(videoId: string, imageType: ImageType): string;

  /** Validate video file mime type */
  isValidVideoMimeType(mimeType: string): boolean;

  /** Validate stream file mime type */
  isValidStreamMimeType(mimeType: string): boolean;

  /** Validate image file mime type */
  isValidImageMimeType(mimeType: string): boolean;

  /** Validate segment filename (e.g., segment-0001.ts) */
  isValidSegmentName(filename: string): boolean;

  /** Handle video upload completion */
  handleVideoUploadComplete(options: VideoUploadOptions): Promise<UploadResult>;

  /** Handle stream upload completion */
  handleStreamUploadComplete(options: StreamUploadOptions): UploadResult;

  /** Handle image upload completion */
  handleImageUploadComplete(options: ImageUploadOptions): Promise<UploadResult>;

  /** Save uploaded file to disk */
  saveUploadedFile(file: MultipartFile, destinationPath: string): Promise<void>;

  /** Track upload progress */
  trackProgress(request: FastifyRequest, videoId: string, format: string, resolution: string): void;

  /** Handle video upload error */
  handleUploadError(videoId: string): void;
}

export class VideoUploadService implements IVideoUploadService {
  private readonly videosService: IVideoService;
  private readonly uploadTrackerService: IUploadTrackerService;
  private readonly cloudflareService: CloudflareService;
  private readonly websocketService: IWebSocketService;
  private readonly logger: Logger;

  constructor(
    videosService: IVideoService,
    uploadTrackerService: IUploadTrackerService,
    cloudflareService: CloudflareService,
    websocketService: WebSocketService,
    logger: Logger
  ) {
    this.videosService = videosService;
    this.uploadTrackerService = uploadTrackerService;
    this.cloudflareService = cloudflareService;
    this.websocketService = websocketService;
    this.logger = logger;
  }

  /**
   * Validate video upload parameters
   */
  validateVideoUploadParams(format: string, resolution: string): boolean {
    return VALID_FORMATS.has(format) && VALID_RESOLUTIONS.has(resolution);
  }

  /**
   * Get destination path for a video upload
   */
  getVideoDestinationPath(
    videoId: string,
    format: string,
    resolution: string,
    filename: string
  ): string | null {
    const config = getConfig();
    const videosDir = config.paths.videosDirectoryPath;

    if (format === 'm3u8') {
      const manifestFileName = `manifest-${resolution}.m3u8`;

      if (filename === manifestFileName) {
        // Manifest file goes in adaptive/m3u8 directory
        return path.join(videosDir, videoId, 'adaptive', 'm3u8');
      } else if (this.isValidSegmentName(filename)) {
        // Segment files go in adaptive/m3u8/{resolution} directory
        return path.join(videosDir, videoId, 'adaptive', 'm3u8', resolution);
      }

      return null; // Invalid filename
    } else if (format === 'mp4') {
      return path.join(videosDir, videoId, 'progressive', 'mp4');
    } else if (format === 'webm') {
      return path.join(videosDir, videoId, 'progressive', 'webm');
    } else if (format === 'ogv') {
      return path.join(videosDir, videoId, 'progressive', 'ogv');
    }

    return null;
  }

  /**
   * Get destination path for a stream upload
   */
  getStreamDestinationPath(
    videoId: string,
    format: string,
    resolution: string,
    filename: string
  ): string | null {
    const config = getConfig();
    const videosDir = config.paths.videosDirectoryPath;

    if (format === 'm3u8') {
      const manifestFileName = `manifest-${resolution}.m3u8`;

      if (filename === manifestFileName) {
        return path.join(videosDir, videoId, 'adaptive', 'm3u8');
      } else if (this.isValidSegmentName(filename)) {
        return path.join(videosDir, videoId, 'adaptive', 'm3u8', resolution);
      }
    }

    return null;
  }

  /**
   * Get destination path for an image upload
   */
  getImageDestinationPath(videoId: string, _imageType: 'thumbnail' | 'preview' | 'poster'): string {
    const config = getConfig();
    const videosDir = config.paths.videosDirectoryPath;
    return path.join(videosDir, videoId, 'images');
  }

  /**
   * Validate video file mime type
   */
  isValidVideoMimeType(mimeType: string): boolean {
    return VALID_VIDEO_MIME_TYPES.has(mimeType);
  }

  /**
   * Validate stream file mime type
   */
  isValidStreamMimeType(mimeType: string): boolean {
    return VALID_STREAM_MIME_TYPES.has(mimeType);
  }

  /**
   * Validate image file mime type
   */
  isValidImageMimeType(mimeType: string): boolean {
    return VALID_IMAGE_MIME_TYPES.has(mimeType);
  }

  /**
   * Validate segment filename (e.g., segment-0001.ts)
   */
  isValidSegmentName(filename: string): boolean {
    // Match patterns like: segment-0001.ts, 0.ts, output0001.ts, etc.
    const segmentPattern = /^[a-zA-Z0-9_-]+\.ts$/;
    return segmentPattern.test(filename);
  }

  /**
   * Handle video upload completion
   */
  async handleVideoUploadComplete(options: VideoUploadOptions): Promise<UploadResult> {
    const { videoId, format, resolution } = options;

    try {
      // Stop tracking the upload
      this.uploadTrackerService.stopTracking(videoId);

      // Purge Cloudflare cache
      await this.cloudflareService.purgeNodePage();
      await this.cloudflareService.purgeAllWatchPages();

      // Format-specific purge
      if (format === 'm3u8') {
        await this.cloudflareService.purgeAdaptiveVideos(videoId);
      } else {
        await this.cloudflareService.purgeProgressiveVideos(videoId);
      }

      this.logger.info('Video upload completed', { videoId, format, resolution });

      return {
        success: true,
        videoId,
        format,
        resolution,
      };
    } catch (error) {
      this.logger.error('Video upload completion failed', error, {
        videoId,
        format,
        resolution,
      });

      return {
        success: false,
        videoId,
        format,
        resolution,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle stream upload completion
   */
  handleStreamUploadComplete(options: StreamUploadOptions): UploadResult {
    const { videoId, format, resolution } = options;

    this.logger.debug('Stream upload completed', { videoId, format, resolution });

    return {
      success: true,
      videoId,
      format,
      resolution,
    };
  }

  /**
   * Handle image upload completion
   */
  async handleImageUploadComplete(options: ImageUploadOptions): Promise<UploadResult> {
    const { videoId, imageType } = options;

    try {
      // Purge Cloudflare cache based on image type
      switch (imageType) {
        case 'thumbnail':
          await this.cloudflareService.purgeVideoThumbnailImages([videoId]);
          break;
        case 'preview':
          // Mark index as outdated since preview is used in search results
          await this.videosService.markIndexOutdated(videoId);
          await this.cloudflareService.purgeVideoPreviewImages([videoId]);
          break;
        case 'poster':
          await this.cloudflareService.purgeVideoPosterImages([videoId]);
          break;
      }

      this.logger.info('Image upload completed', { videoId, imageType });

      return {
        success: true,
        videoId,
      };
    } catch (error) {
      this.logger.error('Image upload completion failed', error, {
        videoId,
        imageType,
      });

      return {
        success: false,
        videoId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Save uploaded file to disk
   */
  async saveUploadedFile(file: MultipartFile, destinationPath: string): Promise<void> {
    // Ensure directory exists
    fs.mkdirSync(destinationPath, { recursive: true });

    const filePath = path.join(destinationPath, file.filename);
    const buffer = await file.toBuffer();

    fs.writeFileSync(filePath, buffer);

    this.logger.debug('Saved uploaded file', { filename: file.filename, path: filePath });
  }

  /**
   * Track upload progress and broadcast via WebSocket
   */
  trackProgress(
    request: FastifyRequest,
    videoId: string,
    format: string,
    resolution: string
  ): void {
    const contentLength = Number.parseInt(request.headers['content-length'] ?? '0', 10);

    if (contentLength <= 0) {
      return;
    }

    // Start tracking
    this.uploadTrackerService.startTracking(videoId, format, resolution);
    this.uploadTrackerService.addRequest(videoId, request);

    let receivedBytes = 0;
    let lastBroadcastTime = 0;

    request.raw.on('data', (chunk: Buffer) => {
      // Skip if stopping
      if (this.uploadTrackerService.isStopping(videoId)) {
        return;
      }

      receivedBytes += chunk.length;

      // Calculate progress (50-100 range, first 50% is encoding)
      const uploadProgress = Math.floor(((receivedBytes / contentLength) * 100) / 2) + 50;
      this.uploadTrackerService.updateProgress(videoId, uploadProgress);

      // Rate limit broadcasts to once per second
      const now = Date.now();
      if (now - lastBroadcastTime > 1000 || uploadProgress === 100) {
        lastBroadcastTime = now;

        this.websocketService.broadcastToNodes({
          eventName: 'echo',
          data: {
            eventName: 'video_status',
            payload: {
              type: 'publishing',
              videoId,
              format,
              resolution,
              progress: uploadProgress,
            },
          },
        });
      }
    });
  }

  /**
   * Handle video upload error
   */
  handleUploadError(videoId: string): void {
    this.uploadTrackerService.completeStop(videoId);
  }
}
