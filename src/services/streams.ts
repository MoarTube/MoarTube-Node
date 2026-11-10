import { withJobAdmission } from '@/utils/distribution-admission.js';
import { rewriteManifestFile } from '@/utils/manifest-transform.js';
/**
 * Stream Service
 *
 * Service layer for live streaming functionality including stream lifecycle
 * management, recording configuration, and live chat integration.
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { StreamCleanupQueue, type StreamCleanupJob } from '@/utils/stream-cleanup.js';
import type { StorageService } from '@/services/storage.js';
import path from 'node:path';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { StreamConfig } from '@services/interfaces.js';
import type {
  IVideosRepository,
  ILiveChatMessagesRepository,
  ICommentsRepository,
  SQLiteVideo,
  SQLiteNewVideo,
  PostgresVideo,
  PostgresNewVideo,
  SQLiteComment,
  SQLiteNewComment,
  PostgresComment,
  PostgresNewComment,
  SQLiteLiveChatMessage,
  SQLiteNewLiveChatMessage,
  PostgresLiveChatMessage,
  PostgresNewLiveChatMessage,
} from '@database/index.js';
import { getConfig } from '@config/index.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import { deleteDirectory } from '@/utils/index.js';
import { type WebSocketService } from '@services/websocket.js';
import { type CloudflareService } from '@services/cloudflare.js';

/**
 * Stream metadata stored in video meta field
 */
export interface StreamMeta {
  streamGeneration?: string;
  streamCleanupAt?: number;
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
export class StreamsService extends BaseService {
  private readonly videoRepository:
    | IVideosRepository<SQLiteVideo, SQLiteNewVideo>
    | IVideosRepository<PostgresVideo, PostgresNewVideo>;
  private readonly liveChatMessageRepository:
    | ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage>
    | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>;
  private readonly commentsRepository:
    | ICommentsRepository<SQLiteComment, SQLiteNewComment>
    | ICommentsRepository<PostgresComment, PostgresNewComment>;
  private readonly websocketService: WebSocketService;
  private readonly cloudflareService: CloudflareService;
  private cleanup: StreamCleanupQueue | undefined;

  constructor(
    logger: Logger,
    videosRepository:
      | IVideosRepository<SQLiteVideo, SQLiteNewVideo>
      | IVideosRepository<PostgresVideo, PostgresNewVideo>,
    liveChatMessagesRepository:
      | ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage>
      | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>,
    commentsRepository:
      | ICommentsRepository<SQLiteComment, SQLiteNewComment>
      | ICommentsRepository<PostgresComment, PostgresNewComment>,
    websocketService: WebSocketService,
    cloudflareService: CloudflareService,
    private readonly storageService: StorageService
  ) {
    super('StreamService', logger);
    this.videoRepository = videosRepository;
    this.liveChatMessageRepository = liveChatMessagesRepository;
    this.commentsRepository = commentsRepository;
    this.websocketService = websocketService;
    this.cloudflareService = cloudflareService;
  }

  /**
   * Start a new live stream or resume existing
   */
  async startStream(videoId: string, config?: StreamConfig): Promise<void> {
    return withJobAdmission(() =>
      this.withErrorLogging('startStream', async () => {
        const video = await this.videoRepository.findById(videoId);
        if (!video) {
          throw new Error(`Video not found: ${videoId}`);
        }

        getConfig().reloadNodeSettings();
        const isRecordedRemotely = config?.isRecordedRemotely ?? false;
        const isRecordedLocally = config?.isRecordedLocally ?? false;

        const metadata = this.safeJsonParse<StreamMeta>(video.meta, {});
        metadata.streamGeneration = randomUUID();
        delete metadata.streamCleanupAt;
        await this.videoRepository.update(videoId, {
          meta: JSON.stringify(metadata),
          is_streaming: true,
          is_streamed: false,
          is_stream_recorded_remotely: isRecordedRemotely,
          is_stream_recorded_locally: isRecordedLocally,
          is_error: false,
        });

        this.logger.info('Stream started', { videoId, isRecordedRemotely, isRecordedLocally });
        await this.invalidateStreamMedia(videoId);
        await this.cloudflareService.purgeHomePage([videoId]);

        // Broadcast stream start
        this.broadcastStreamEvent('stream_started', {
          videoId,
          isLive: true,
          isStreaming: true,
        });
      })
    );
  }

  /**
   * Stop an active live stream
   */
  async stopStream(videoId: string, drainSeconds = 0): Promise<void> {
    return withSettingsChange(getConfig().paths.nodeSettingsPath, () =>
      this.withErrorLogging('stopStream', async () => {
        getConfig().reloadNodeSettings();
        const video = await this.videoRepository.findById(videoId);
        if (!video) {
          throw new Error(`Video not found: ${videoId}`);
        }

        // Update streaming flags
        const updateData: Record<string, unknown> = {
          is_streaming: false,
          is_streamed: true,
        };

        // Finalize HLS manifest files (filesystem mode only)
        const drain = await this.finalizeStreamManifests(videoId);

        updateData['is_published'] = video.is_stream_recorded_remotely && drain !== undefined;
        if (!video.is_stream_recorded_remotely || drain === undefined) {
          const config = getConfig();
          const metadata = this.safeJsonParse<StreamMeta>(video.meta, {});
          const generation = metadata.streamGeneration ?? String(video.creation_timestamp);
          const deadline =
            metadata.streamCleanupAt ??
            Date.now() + Math.ceil(Math.max(drain ?? 0, drainSeconds * 1000, 6000));
          metadata.streamCleanupAt = deadline;
          // Journal before committing stopped flags: recovery can finish an interrupted stop.
          await this.cleanupQueue().enqueue({
            videoId,
            generation,
            deadline,
            storageConfig: config.nodeSettings.storageConfig,
            videosDirectory: config.paths.videosDirectoryPath,
          });
          updateData['meta'] = JSON.stringify(metadata);
        }
        await this.videoRepository.update(videoId, updateData);

        // Delete live chat messages
        const deletedCount = await this.liveChatMessageRepository.deleteByVideoId(videoId);
        this.logger.debug('Deleted live chat messages on stream stop', { videoId, deletedCount });

        // Purge Cloudflare cache
        await this.cloudflareService.purgeHomePage([videoId]);

        this.broadcastStreamEvent('stream_stopped', {
          videoId,
          isLive: false,
          isStreaming: false,
        });

        this.logger.info('Stream stopped', { videoId });
      })
    );
  }

  /**
   * Get all currently streaming videos
   */
  async getActiveStreams(): Promise<(SQLiteVideo | PostgresVideo)[]> {
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
   * Start a new stream with full configuration
   */
  async startNewStream(options: StartStreamOptions): Promise<{ videoId: string }> {
    return withJobAdmission(() =>
      this.withErrorLogging('startNewStream', async () => {
        getConfig().reloadNodeSettings();
        let videoId = options.existingVideoId;

        const isResumingStream = videoId !== undefined;

        // Generate new video ID if not resuming
        if (videoId === undefined) {
          videoId = this.generateId(11);
          // Keep generating until unique
          while (await this.videoRepository.findById(videoId)) {
            videoId = this.generateId(11);
          }
        }

        const tagsSanitized = this.sanitizeWhitespace(options.tags);

        // Create storage directories (remove if already present)
        await this.createStreamStorageDirectories(videoId, options.resolution);

        const outputs = JSON.stringify({
          m3u8: [options.resolution],
          mp4: [],
          webm: [],
          ogv: [],
        });

        const timestamp = this.getCurrentTimestampMs();

        if (isResumingStream) {
          // Retrieve existing video to preserve chatSettings
          const existingVideo = await this.videoRepository.findById(videoId);
          if (!existingVideo) {
            throw new Error('video with id does not exist: ' + videoId);
          }

          // Parse existing meta and preserve chatSettings while updating stream fields
          const existingMeta = this.safeJsonParse<StreamMeta>(existingVideo.meta, {});

          existingMeta.streamGeneration = randomUUID();
          delete existingMeta.streamCleanupAt;
          existingMeta.rtmpPort = options.rtmpPort;
          existingMeta.networkAddress = options.networkAddress;
          existingMeta.resolution = options.resolution;
          existingMeta.isRecordingStreamRemotely = options.isRecordingStreamRemotely;
          existingMeta.isRecordingStreamLocally = options.isRecordingStreamLocally;

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
            is_error: false,
            outputs,
            meta: JSON.stringify(existingMeta),
            creation_timestamp: timestamp,
          });

          const deletedComments = await this.commentsRepository.deleteByVideoId(videoId);
          this.logger.debug('Deleted comments on stream resume', { videoId, deletedComments });

          const deletedChatMessages = await this.liveChatMessageRepository.deleteByVideoId(videoId);
          this.logger.debug('Deleted live chat messages on stream resume', {
            videoId,
            deletedChatMessages,
          });

          this.logger.info('Stream resumed', { videoId });
        } else {
          // Create new video record for stream
          const newMeta: StreamMeta = {
            streamGeneration: randomUUID(),
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

          const videoData: SQLiteNewVideo | PostgresNewVideo = {
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
            meta: JSON.stringify(newMeta),
            creation_timestamp: timestamp,
          };

          await this.videoRepository.create(videoData);

          this.logger.info('New stream created', { videoId });
        }

        this.broadcastStreamEvent('video_data', {
          videoId,
          thumbnail: '',
          title: options.title,
          description: options.description,
          tags: tagsSanitized,
          lengthSeconds: 0,
          lengthTimestamp: '',
          views: 0,
          comments: 0,
          likes: 0,
          dislikes: 0,
          bandwidth: 0,
          isImporting: 0,
          isImported: 0,
          isPublishing: 0,
          isPublished: 0,
          isLive: 1,
          isStreaming: 1,
          isStreamed: 0,
          isStreamRecordedRemotely: options.isRecordingStreamRemotely,
          isStreamRecordedLocally: options.isRecordingStreamLocally,
          isError: 0,
          isFinalized: 0,
        });

        // Restreaming resets the whole video tree and deletes its comments.
        if (isResumingStream) {
          const config = getConfig();
          await this.cloudflareService.purgePrefixes([
            config.getExternalVideosBaseUrl() + '/external/videos/' + videoId + '/',
            config.getNodeBaseUrl() + '/videos/' + videoId + '/comments',
          ]);
        } else {
          await this.invalidateStreamMedia(videoId);
        }
        await this.cloudflareService.purgeHomePage([videoId]);

        return { videoId };
      })
    );
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
  async finalizeStreamManifests(videoId: string): Promise<number | undefined> {
    const config = getConfig();
    if (config.nodeSettings.storageConfig.storageMode === 'filesystem') {
      const duration = await this.endHlsManifests(
        path.join(config.paths.videosDirectoryPath, videoId, 'adaptive', 'm3u8')
      );
      this.logger.info('Stream manifests finalized', { videoId });
      await this.invalidateStreamMedia(videoId);
      return duration;
    }
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      throw new Error('Stream no longer exists');
    }
    const outputs = this.safeJsonParse<{ m3u8?: string[] }>(video.outputs, {});
    const duration = await this.storageService.finalizeS3Stream(
      videoId,
      outputs.m3u8 ?? [],
      video.is_stream_recorded_remotely
    );
    await this.invalidateStreamMedia(videoId);
    return duration;
  }

  /**
   * Finalize all streamed video HLS manifests at startup
   * Used for cleanup when server restarts after a crash mid-stream
   */
  async finalizeAllStreamedManifests(): Promise<void> {
    const config = getConfig();
    const storageMode = config.nodeSettings.storageConfig.storageMode;

    if (storageMode !== 'filesystem') {
      return;
    }

    let count = 0;
    for (let offset = 0; ; offset += 100) {
      const videos = await this.videoRepository.findAll({ limit: 100, offset });
      for (const video of videos) {
        if (!video.is_streaming && video.is_streamed && video.is_stream_recorded_remotely) {
          await this.endHlsManifests(
            path.join(config.paths.videosDirectoryPath, video.video_id, 'adaptive', 'm3u8')
          );
          count++;
        }
      }
      if (videos.length < 100) {
        break;
      }
    }
    this.logger.info('Finalized all streamed HLS manifests', { count });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create storage directories for a stream
   */
  private async createStreamStorageDirectories(videoId: string, resolution: string): Promise<void> {
    try {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;
        const publicDir = config.paths.publicDirectoryPath;
        const videoDir = path.join(videosDir, videoId);

        await deleteDirectory(videoDir);

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
      this.logger.error('Failed to create stream directories', error, { videoId });

      throw error;
    }
  }

  /**
   * End HLS manifest files by converting EVENT to VOD and appending #EXT-X-ENDLIST
   *
   * Legacy layout: manifests live in resolution subdirectories as manifest-{resolution}.m3u8
   * e.g., {adaptiveDir}/{resolution}/manifest-{resolution}.m3u8
   */
  private async endHlsManifests(adaptiveDir: string): Promise<number | undefined> {
    let longest = 0;
    let finalized = false;
    if (!fs.existsSync(adaptiveDir)) {
      return undefined;
    }
    const entries = fs.readdirSync(adaptiveDir, { withFileTypes: true });
    // Media playlists must exist in their final form before publishing the master.
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const directory = typeof entry !== 'string' && entry.isDirectory();
      const file = directory
        ? path.join(adaptiveDir, name, 'manifest-' + name + '.m3u8')
        : path.join(adaptiveDir, name);
      if (
        name !== 'manifest-master.m3u8' &&
        (directory || name.endsWith('.m3u8')) &&
        fs.existsSync(file)
      ) {
        let duration = 0,
          maximum = 0;
        await rewriteManifestFile(
          file,
          (line) => {
            const match = /^#EXTINF:([0-9.]+)/.exec(line);
            if (match) {
              const value = Number(match[1]);
              duration += value;
              maximum = Math.max(maximum, value);
            }
            return line;
          },
          true
        );
        finalized = true;
        longest = Math.max(longest, duration + maximum);
      }
    }
    if (!finalized) {
      const hasSegments = entries.some((entry) => {
        const name = typeof entry === 'string' ? entry : entry.name;
        return (
          name.endsWith('.ts') ||
          (typeof entry !== 'string' &&
            entry.isDirectory() &&
            fs.readdirSync(path.join(adaptiveDir, name)).some((file) => file.endsWith('.ts')))
        );
      });
      if (hasSegments) {
        throw new Error('Stream rendition is missing; existing media was retained.');
      }
      return undefined;
    }
    const master = path.join(adaptiveDir, 'manifest-master.m3u8');
    if (fs.existsSync(master)) {
      await rewriteManifestFile(master, (line) =>
        ['#EXT-X-ENDLIST', '#MOARTUBE-LIVE'].includes(line.trim()) ? '' : line
      );
    }
    return Math.ceil((longest + 6) * 1000);
  }

  private cleanupQueue(): StreamCleanupQueue {
    this.cleanup ??= new StreamCleanupQueue(
      getConfig().paths.nodeSettingsPath + '.stream-cleanup',
      (job) => this.cleanStoppedStream(job),
      (error) => {
        this.logger.error('Stopped stream cleanup will retry', error);
      }
    );
    return this.cleanup;
  }

  private async cleanStoppedStream(job: StreamCleanupJob): Promise<void> {
    await withSettingsChange(getConfig().paths.nodeSettingsPath, async () => {
      getConfig().reloadNodeSettings();
      const video = await this.videoRepository.findById(job.videoId);
      if (!video) {
        return;
      }
      const metadata = this.safeJsonParse<StreamMeta>(video.meta, {});
      if ((metadata.streamGeneration ?? String(video.creation_timestamp)) !== job.generation) {
        return;
      }
      if (metadata.streamCleanupAt === undefined && !video.is_streaming) {
        return;
      }
      if (metadata.streamCleanupAt !== undefined && metadata.streamCleanupAt !== job.deadline) {
        return;
      }
      await this.storageService.deleteStoppedStream(
        job.videoId,
        job.storageConfig,
        job.videosDirectory
      );
      delete metadata.streamCleanupAt;
      await this.videoRepository.update(job.videoId, {
        is_streaming: false,
        is_streamed: true,
        meta: JSON.stringify(metadata),
      });
      await this.invalidateStreamMedia(job.videoId);
      await this.cloudflareService.purgeHomePage([job.videoId]);
    });
  }

  async recoverStreamCleanup(): Promise<void> {
    await this.cleanupQueue().recover();
  }
  async invalidateStreamMedia(
    videoId: string,
    segment?: { format: string; resolution: string; segmentName: string }
  ): Promise<void> {
    if (segment) {
      await this.cloudflareService.purgeFiles([
        getConfig().getExternalVideosBaseUrl() +
          '/external/videos/' +
          videoId +
          '/adaptive/' +
          segment.format +
          '/' +
          segment.resolution +
          '/segments/' +
          segment.segmentName,
      ]);
      return;
    }
    await this.cloudflareService.purgeAdaptiveVideos(videoId);
  }
  close(): void {
    this.cleanup?.close();
  }

  /**
   * Broadcast stream event via WebSocket
   */
  private broadcastStreamEvent(eventName: string, payload: Record<string, unknown>): void {
    this.websocketService.broadcastToNodes({
      eventName: 'echo',
      data: {
        eventName,
        payload,
      },
    });
  }
}
