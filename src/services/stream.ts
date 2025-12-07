/**
 * Stream Service
 *
 * Service layer for live streaming functionality including stream lifecycle
 * management, recording configuration, and live chat integration.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BaseService, type ServiceOptions } from './base.js';
import type { IStreamService, StreamConfig, IWebSocketService } from './interfaces.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { LiveChatMessageRepository } from '../database/repositories/live-chat-messages.js';
import type { DrizzleVideo, DrizzleNewVideo } from '../database/schemas/index.js';
import { getConfig } from '../config/index.js';

/**
 * Stream service dependencies
 */
export interface StreamServiceDependencies {
  videoRepository: VideosRepository;
  liveChatMessageRepository?: LiveChatMessageRepository;
  websocketService?: IWebSocketService;
}

/**
 * Stream metadata stored in video meta field
 */
export interface StreamMeta {
  chatSettings?: {
    isChatHistoryEnabled: boolean;
    chatHistoryLimit: number;
  };
  rtmpPort?: number;
  uuid?: string;
  networkAddress?: string;
  resolution?: string;
  isRecordingStreamRemotely?: boolean;
  isRecordingStreamLocally?: boolean;
}

/**
 * Stream start options
 */
export interface StartStreamOptions {
  title: string;
  description: string;
  tags: string;
  rtmpPort: number;
  networkAddress: string;
  resolution: string;
  isRecordingStreamRemotely: boolean;
  isRecordingStreamLocally: boolean;
  /** Existing video ID to resume stream (optional) */
  existingVideoId?: string;
}

/**
 * StreamService class
 *
 * Handles all live streaming-related business logic including:
 * - Stream lifecycle (start, stop, pause)
 * - Recording configuration
 * - Stream state management
 * - Integration with video records
 */
export class StreamService extends BaseService implements IStreamService {
  private readonly videoRepository: VideosRepository;
  private readonly liveChatMessageRepository: LiveChatMessageRepository | undefined;
  private readonly websocketService: IWebSocketService | undefined;

  constructor(
    videoRepository: VideosRepository,
    liveChatMessageRepository: LiveChatMessageRepository,
    websocketService?: IWebSocketService,
    options?: ServiceOptions
  ) {
    super('StreamService', options);
    this.videoRepository = videoRepository;
    this.liveChatMessageRepository = liveChatMessageRepository;
    this.websocketService = websocketService;
  }

  /**
   * Start a new live stream or resume existing
   */
  async startStream(videoId: string, config?: StreamConfig): Promise<void> {
    return this.withErrorLogging('startStream', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const isRecordedRemotely = config?.isRecordedRemotely ?? false;
      const isRecordedLocally = config?.isRecordedLocally ?? false;

      await this.videoRepository.update(videoId, {
        is_streaming: true,
        is_streamed: false,
        is_live: true,
        is_stream_recorded_remotely: isRecordedRemotely,
        is_stream_recorded_locally: isRecordedLocally,
        is_error: false,
      });

      this.logger.info('Stream started', { videoId, isRecordedRemotely, isRecordedLocally });

      // Broadcast stream start
      this.broadcastStreamEvent('stream_started', {
        videoId,
        isLive: true,
        isStreaming: true,
      });
    });
  }

  /**
   * Stop an active live stream
   */
  async stopStream(videoId: string): Promise<void> {
    return this.withErrorLogging('stopStream', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      await this.videoRepository.update(videoId, {
        is_streaming: false,
        is_live: false,
        is_streamed: true,
      });

      this.logger.info('Stream stopped', { videoId });

      // Broadcast stream stop
      this.broadcastStreamEvent('stream_stopped', {
        videoId,
        isLive: false,
        isStreaming: false,
        isStreamed: true,
      });
    });
  }

  /**
   * Set stream as live (receiving data)
   */
  async setLive(videoId: string, isLive: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { is_live: isLive });

    this.broadcastStreamEvent('stream_live_status', {
      videoId,
      isLive,
    });
  }

  /**
   * Get all currently streaming videos
   */
  async getActiveStreams(): Promise<DrizzleVideo[]> {
    return this.videoRepository.findStreaming();
  }

  /**
   * Check if a video is currently streaming
   */
  async isStreaming(videoId: string): Promise<boolean> {
    const video = await this.videoRepository.findById(videoId);
    return video?.is_streaming ?? false;
  }

  /**
   * Mark stream as streamed (completed)
   */
  async setStreamed(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      is_streaming: false,
      is_streamed: true,
      is_live: false,
    });

    this.logger.info('Stream marked as completed', { videoId });
  }

  /**
   * Start a new stream with full configuration
   */
  async startNewStream(options: StartStreamOptions): Promise<{ videoId: string }> {
    return this.withErrorLogging('startNewStream', async () => {
      let videoId = options.existingVideoId;
      const isResumingStream = videoId !== undefined && videoId !== '';

      // Generate new video ID if not resuming
      if (videoId === undefined || videoId === '') {
        videoId = this.generateId(11);
        // Keep generating until unique
        while (await this.videoRepository.findById(videoId)) {
          videoId = this.generateId(11);
        }
      }

      const tagsSanitized = this.sanitizeWhitespace(options.tags);

      // Create storage directories
      this.createStreamStorageDirectories(videoId, options.resolution);

      const outputs = JSON.stringify({
        m3u8: [options.resolution],
        mp4: [],
        webm: [],
        ogv: [],
      });

      const meta: StreamMeta = {
        chatSettings: {
          isChatHistoryEnabled: true,
          chatHistoryLimit: 0,
        },
        rtmpPort: options.rtmpPort,
        uuid: 'moartube',
        networkAddress: options.networkAddress,
        resolution: options.resolution,
        isRecordingStreamRemotely: options.isRecordingStreamRemotely,
        isRecordingStreamLocally: options.isRecordingStreamLocally,
      };

      const timestamp = this.getCurrentTimestampMs();

      if (isResumingStream) {
        // Update existing video record
        await this.videoRepository.update(videoId, {
          title: options.title,
          description: options.description,
          tags: tagsSanitized,
          length_seconds: 0,
          length_timestamp: '',
          views: 0,
          comments: 0,
          likes: 0,
          dislikes: 0,
          bandwidth: 0,
          is_publishing: false,
          is_published: false,
          is_streaming: true,
          is_streamed: false,
          is_stream_recorded_remotely: options.isRecordingStreamRemotely,
          is_stream_recorded_locally: options.isRecordingStreamLocally,
          is_live: true,
          is_error: false,
          outputs,
          meta: JSON.stringify(meta),
          creation_timestamp: timestamp,
        });

        // Clear previous comments for resumed stream
        if (this.liveChatMessageRepository) {
          // Would clear chat messages here
        }

        this.logger.info('Stream resumed', { videoId });
      } else {
        // Create new video record for stream
        const videoData: DrizzleNewVideo = {
          video_id: videoId,
          source_file_extension: '',
          title: options.title,
          description: options.description,
          tags: tagsSanitized,
          length_seconds: 0,
          length_timestamp: '',
          views: 0,
          comments: 0,
          likes: 0,
          dislikes: 0,
          bandwidth: 0,
          is_importing: false,
          is_imported: false,
          is_publishing: false,
          is_published: false,
          is_streaming: true,
          is_streamed: false,
          is_stream_recorded_remotely: options.isRecordingStreamRemotely,
          is_stream_recorded_locally: options.isRecordingStreamLocally,
          is_live: true,
          is_indexing: false,
          is_indexed: false,
          is_index_outdated: false,
          is_error: false,
          is_finalized: false,
          is_hidden: false,
          is_passworded: false,
          password: '',
          is_comments_enabled: true,
          is_likes_enabled: true,
          is_dislikes_enabled: true,
          is_reports_enabled: true,
          is_live_chat_enabled: true,
          outputs,
          meta: JSON.stringify(meta),
          creation_timestamp: timestamp,
        };

        await this.videoRepository.create(videoData);
        this.logger.info('New stream created', { videoId });
      }

      // Broadcast stream creation
      this.broadcastStreamEvent('stream_data', {
        videoId,
        title: options.title,
        description: options.description,
        tags: tagsSanitized,
        isStreaming: true,
        isLive: true,
        resolution: options.resolution,
        creationTimestamp: timestamp,
      });

      return { videoId };
    });
  }

  /**
   * Update stream metadata
   */
  async updateStreamMeta(videoId: string, meta: Partial<StreamMeta>): Promise<void> {
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const existingMeta = this.safeJsonParse<StreamMeta>(video.meta, {});
    const updatedMeta = { ...existingMeta, ...meta };

    await this.videoRepository.update(videoId, {
      meta: JSON.stringify(updatedMeta),
    });
  }

  /**
   * Get stream metadata
   */
  async getStreamMeta(videoId: string): Promise<StreamMeta | null> {
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      return null;
    }

    return this.safeJsonParse<StreamMeta>(video.meta, {});
  }

  /**
   * Finalize stream HLS manifest files
   */
  finalizeStreamManifests(videoId: string): void {
    const config = getConfig();
    const storageMode = config.nodeSettings.storageConfig.storageMode;

    if (storageMode === 'filesystem') {
      const videosDir = config.paths.videosDirectoryPath;
      const adaptiveDir = path.join(videosDir, videoId, 'adaptive', 'm3u8');

      // End the HLS manifest files by appending #EXT-X-ENDLIST
      this.endHlsManifests(adaptiveDir);
    }

    this.logger.info('Stream manifests finalized', { videoId });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create storage directories for a stream
   */
  private createStreamStorageDirectories(videoId: string, resolution: string): void {
    try {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;
        const publicDir = config.paths.publicDirectoryPath;
        const videoDir = path.join(videosDir, videoId);

        // Create directories
        fs.mkdirSync(path.join(videoDir, 'images'), { recursive: true });
        fs.mkdirSync(path.join(videoDir, 'adaptive'), { recursive: true });
        fs.mkdirSync(path.join(videoDir, 'progressive'), { recursive: true });
        fs.mkdirSync(path.join(videoDir, 'adaptive', 'm3u8', resolution), { recursive: true });

        // Copy default images
        const publicImagesDir = path.join(publicDir, 'images');
        const videoImagesDir = path.join(videoDir, 'images');

        const imageFiles = ['thumbnail.jpg', 'preview.jpg', 'poster.jpg'];
        for (const file of imageFiles) {
          const srcPath = path.join(publicImagesDir, file);
          const destPath = path.join(videoImagesDir, file);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }

        this.logger.debug('Created stream directories', { videoId, resolution });
      }
    } catch (error) {
      this.logger.error('Failed to create stream directories', error as Error, { videoId });
      throw error;
    }
  }

  /**
   * End HLS manifest files by appending #EXT-X-ENDLIST
   */
  private endHlsManifests(adaptiveDir: string): void {
    if (!fs.existsSync(adaptiveDir)) {
      return;
    }

    const files = fs.readdirSync(adaptiveDir);
    for (const file of files) {
      if (file.endsWith('.m3u8')) {
        const filePath = path.join(adaptiveDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('#EXT-X-ENDLIST')) {
          fs.appendFileSync(filePath, '\n#EXT-X-ENDLIST\n');
        }
      }
    }
  }

  /**
   * Broadcast stream event via WebSocket
   */
  private broadcastStreamEvent(eventName: string, payload: Record<string, unknown>): void {
    if (this.websocketService) {
      this.websocketService.broadcastToNodes({
        eventName: 'echo',
        data: {
          eventName,
          payload,
        },
      });
    }
  }
}
