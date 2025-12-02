/**
 * Videos Service
 *
 * Service layer for video-related business logic including CRUD operations,
 * publishing workflows, and metadata management.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BaseService, type ServiceOptions } from './base';
import type {
  IVideoService,
  GetVideosOptions,
  CreateVideoInput,
  UpdateVideoInput,
  IStorageService,
  IWebSocketService,
} from './interfaces';
import type { VideosRepository } from '../database/repositories/videos';
import type { CommentsRepository } from '../database/repositories/comments';
import type { DrizzleVideo, DrizzleNewVideo } from '../database/schema';
import type { PaginatedResult } from '../types/models';
import { getConfig } from '../config';

/**
 * Videos service dependencies
 */
export interface VideosServiceDependencies {
  videoRepository: VideosRepository;
  commentRepository?: CommentsRepository;
  storageService?: IStorageService;
  websocketService?: IWebSocketService;
}

/**
 * VideosService class
 *
 * Handles all video-related business logic including:
 * - Video CRUD operations
 * - Import/export workflows
 * - Publishing management
 * - View/like/dislike tracking
 * - Index management
 */
export class VideosService extends BaseService implements IVideoService {
  private readonly videoRepository: VideosRepository;
  private readonly commentRepository: CommentsRepository | undefined;
  private readonly storageService: IStorageService | undefined;
  private readonly websocketService: IWebSocketService | undefined;

  constructor(dependencies: VideosServiceDependencies, options?: ServiceOptions) {
    super('VideosService', options);
    this.videoRepository = dependencies.videoRepository;
    this.commentRepository = dependencies.commentRepository;
    this.storageService = dependencies.storageService;
    this.websocketService = dependencies.websocketService;
  }

  /**
   * Get a single video by ID
   */
  async getVideo(videoId: string): Promise<DrizzleVideo | null> {
    return this.withErrorLogging('getVideo', async () => {
      return this.videoRepository.findById(videoId);
    });
  }

  /**
   * Get videos with filtering and pagination
   */
  async getVideos(options?: GetVideosOptions): Promise<PaginatedResult<DrizzleVideo>> {
    return this.withErrorLogging('getVideos', async () => {
      const limit = options?.limit ?? 20;
      const offset = options?.offset ?? 0;

      // Build query options, omitting undefined values
      const queryOptions: {
        limit: number;
        offset: number;
        sortBy?: 'creation_timestamp' | 'views' | 'likes' | 'title';
        sortDirection?: 'asc' | 'desc';
        isPublished?: boolean;
        isStreaming?: boolean;
        isFinalized?: boolean;
        search?: string;
      } = { limit, offset };

      if (options?.sortBy !== undefined) {
        queryOptions.sortBy = options.sortBy;
      }
      if (options?.sortDirection !== undefined) {
        queryOptions.sortDirection = options.sortDirection;
      }
      if (options?.isPublished !== undefined) {
        queryOptions.isPublished = options.isPublished;
      }
      if (options?.isStreaming !== undefined) {
        queryOptions.isStreaming = options.isStreaming;
      }
      if (options?.isFinalized !== undefined) {
        queryOptions.isFinalized = options.isFinalized;
      }
      if (options?.search !== undefined) {
        queryOptions.search = options.search;
      }

      // Query videos with filters
      const videos = await this.videoRepository.findAll(queryOptions);

      // Build count options, omitting undefined values
      const countOptions: {
        isPublished?: boolean;
        isStreaming?: boolean;
        isFinalized?: boolean;
        search?: string;
      } = {};

      if (options?.isPublished !== undefined) {
        countOptions.isPublished = options.isPublished;
      }
      if (options?.isStreaming !== undefined) {
        countOptions.isStreaming = options.isStreaming;
      }
      if (options?.isFinalized !== undefined) {
        countOptions.isFinalized = options.isFinalized;
      }
      if (options?.search !== undefined) {
        countOptions.search = options.search;
      }

      // Get total count for pagination
      const total = await this.videoRepository.count(countOptions);

      return {
        data: videos,
        total,
        count: videos.length,
        offset,
        limit,
        hasMore: offset + videos.length < total,
      };
    });
  }

  /**
   * Create a new video (import)
   *
   * Creates video record and sets up storage directories
   */
  async createVideo(data: CreateVideoInput): Promise<{ videoId: string }> {
    return this.withErrorLogging('createVideo', async () => {
      // Generate unique video ID
      const videoId = await this.generateUniqueVideoId();
      const creationTimestamp = this.getCurrentTimestampMs();

      // Sanitize input
      const tagsSanitized = this.sanitizeWhitespace(data.tags);

      // Initialize outputs structure
      const outputs = JSON.stringify({ m3u8: [], mp4: [], webm: [], ogv: [] });
      const meta = JSON.stringify({});

      this.logger.info('Creating new video', { videoId, title: data.title });

      // Create storage directories if using filesystem
      this.createVideoStorageDirectories(videoId);

      // Create video record
      const videoData: DrizzleNewVideo = {
        videoId,
        sourceFileExtension: '',
        title: data.title,
        description: data.description,
        tags: tagsSanitized,
        lengthSeconds: 0,
        lengthTimestamp: '',
        views: 0,
        comments: 0,
        likes: 0,
        dislikes: 0,
        bandwidth: 0,
        isImporting: true,
        isImported: false,
        isPublishing: false,
        isPublished: false,
        isStreaming: false,
        isStreamed: false,
        isStreamRecordedRemotely: false,
        isStreamRecordedLocally: false,
        isLive: false,
        isIndexing: false,
        isIndexed: false,
        isIndexOutdated: false,
        isError: false,
        isFinalized: false,
        isHidden: false,
        isPassworded: false,
        password: '',
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: true,
        isReportsEnabled: true,
        isLiveChatEnabled: true,
        outputs,
        meta,
        creationTimestamp,
      };

      await this.videoRepository.create(videoData);

      // Broadcast video creation event
      this.broadcastVideoEvent('video_data', {
        videoId,
        thumbnail: '',
        title: data.title,
        description: data.description,
        tags: tagsSanitized,
        lengthSeconds: 0,
        lengthTimestamp: '',
        views: 0,
        comments: 0,
        likes: 0,
        dislikes: 0,
        bandwidth: 0,
        isImporting: 1,
        isImported: 0,
        isPublishing: 0,
        isPublished: 0,
        isLive: 0,
        isStreaming: 0,
        isStreamed: 0,
        isStreamRecordedRemotely: 0,
        isStreamRecordedLocally: 0,
        isIndexed: 0,
        isIndexing: 0,
        isIndexOutdated: 0,
        isError: 0,
        isFinalized: 0,
        meta,
        creationTimestamp,
      });

      return { videoId };
    });
  }

  /**
   * Update video metadata
   */
  async updateVideo(videoId: string, data: UpdateVideoInput): Promise<DrizzleVideo | null> {
    return this.withErrorLogging('updateVideo', async () => {
      const existingVideo = await this.videoRepository.findById(videoId);
      if (!existingVideo) {
        return null;
      }

      // Build update object with only provided fields
      const updates: Partial<DrizzleNewVideo> = {};

      if (data.title !== undefined) {
        updates.title = data.title;
      }
      if (data.description !== undefined) {
        updates.description = data.description;
      }
      if (data.tags !== undefined) {
        updates.tags = this.sanitizeWhitespace(data.tags);
      }
      if (data.isPublished !== undefined) {
        updates.isPublished = data.isPublished;
      }
      if (data.isHidden !== undefined) {
        updates.isHidden = data.isHidden;
      }
      if (data.isPassworded !== undefined) {
        updates.isPassworded = data.isPassworded;
      }
      if (data.password !== undefined) {
        updates.password = data.password;
      }
      if (data.isCommentsEnabled !== undefined) {
        updates.isCommentsEnabled = data.isCommentsEnabled;
      }
      if (data.isLikesEnabled !== undefined) {
        updates.isLikesEnabled = data.isLikesEnabled;
      }
      if (data.isDislikesEnabled !== undefined) {
        updates.isDislikesEnabled = data.isDislikesEnabled;
      }
      if (data.isReportsEnabled !== undefined) {
        updates.isReportsEnabled = data.isReportsEnabled;
      }
      if (data.isLiveChatEnabled !== undefined) {
        updates.isLiveChatEnabled = data.isLiveChatEnabled;
      }

      // Mark index as outdated if metadata changed and video is indexed
      if (
        existingVideo.isIndexed &&
        (data.title !== undefined || data.description !== undefined || data.tags !== undefined)
      ) {
        updates.isIndexOutdated = true;
      }

      this.logger.debug('Updating video', { videoId, fields: Object.keys(updates) });

      return this.videoRepository.update(videoId, updates);
    });
  }

  /**
   * Delete a video and all associated data
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    return this.withErrorLogging('deleteVideo', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return false;
      }

      this.logger.info('Deleting video', { videoId });

      // Delete comments for the video
      if (this.commentRepository) {
        await this.commentRepository.deleteByVideoId(videoId);
      }

      // Delete storage directories
      await this.deleteVideoStorageDirectories(videoId);

      // Delete video record
      return this.videoRepository.delete(videoId);
    });
  }

  /**
   * Mark video as importing
   */
  async setImporting(videoId: string, isImporting: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { isImporting });
  }

  /**
   * Mark video as imported (import complete)
   */
  async setImported(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      isImporting: false,
      isImported: true,
    });
  }

  /**
   * Mark video as publishing
   */
  async setPublishing(videoId: string, isPublishing: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { isPublishing });
  }

  /**
   * Publish a video
   */
  async publishVideo(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      isPublishing: false,
      isPublished: true,
    });

    this.logger.info('Video published', { videoId });
  }

  /**
   * Unpublish a video
   */
  async unpublishVideo(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      isPublished: false,
    });

    this.logger.info('Video unpublished', { videoId });
  }

  /**
   * Increment view count
   */
  async incrementViews(videoId: string): Promise<void> {
    await this.videoRepository.incrementViews(videoId);
  }

  /**
   * Increment like count
   */
  async incrementLikes(videoId: string): Promise<void> {
    await this.videoRepository.incrementLikes(videoId);
  }

  /**
   * Increment dislike count
   */
  async incrementDislikes(videoId: string): Promise<void> {
    await this.videoRepository.incrementDislikes(videoId);
  }

  /**
   * Finalize a video (mark processing complete)
   */
  async finalizeVideo(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      isFinalized: true,
    });

    this.logger.info('Video finalized', { videoId });
  }

  /**
   * Set video error state
   */
  async setError(videoId: string, isError: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { isError });

    if (isError) {
      this.logger.warn('Video marked as error', { videoId });
    }
  }

  /**
   * Get videos pending indexing
   */
  async getVideosNeedingIndexing(): Promise<DrizzleVideo[]> {
    return this.videoRepository.findPendingIndexing();
  }

  /**
   * Mark video as indexed
   */
  async setIndexed(videoId: string, isIndexed: boolean): Promise<void> {
    await this.videoRepository.update(videoId, {
      isIndexed,
      isIndexOutdated: false,
      isIndexing: false,
    });
  }

  /**
   * Mark video index as outdated
   */
  async setIndexOutdated(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      isIndexOutdated: true,
    });
  }

  /**
   * Set video source file extension
   */
  async setSourceFileExtension(videoId: string, extension: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      sourceFileExtension: extension,
    });
  }

  /**
   * Update video length
   */
  async setVideoLength(
    videoId: string,
    lengthSeconds: number,
    lengthTimestamp: string
  ): Promise<void> {
    await this.videoRepository.update(videoId, {
      lengthSeconds,
      lengthTimestamp,
    });
  }

  /**
   * Update video outputs (available formats/resolutions)
   */
  async updateOutputs(videoId: string, outputs: Record<string, string[]>): Promise<void> {
    await this.videoRepository.update(videoId, {
      outputs: JSON.stringify(outputs),
    });
  }

  /**
   * Add a resolution to video outputs
   */
  async addOutputResolution(videoId: string, format: string, resolution: string): Promise<void> {
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    const outputs = this.safeJsonParse<Record<string, string[]>>(video.outputs, {
      m3u8: [],
      mp4: [],
      webm: [],
      ogv: [],
    });

    if (!outputs[format]) {
      outputs[format] = [];
    }

    if (!outputs[format].includes(resolution)) {
      outputs[format].push(resolution);

      // Sort resolutions descending by quality
      outputs[format].sort((a, b) => {
        const aHeight = parseInt(a.split('p')[0] ?? '0', 10);
        const bHeight = parseInt(b.split('p')[0] ?? '0', 10);
        return bHeight - aHeight;
      });
    }

    await this.updateOutputs(videoId, outputs);
  }

  /**
   * Remove a resolution from video outputs
   */
  async removeOutputResolution(videoId: string, format: string, resolution: string): Promise<void> {
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    const outputs = this.safeJsonParse<Record<string, string[]>>(video.outputs, {
      m3u8: [],
      mp4: [],
      webm: [],
      ogv: [],
    });

    if (outputs[format]) {
      outputs[format] = outputs[format].filter((r) => r !== resolution);
    }

    await this.updateOutputs(videoId, outputs);
  }

  /**
   * Get video publish status for all formats/resolutions
   */
  async getPublishStatus(
    videoId: string
  ): Promise<Array<{ format: string; resolution: string; isPublished: boolean }>> {
    const video = await this.videoRepository.findById(videoId);
    if (!video) {
      throw new Error('Video not found');
    }

    const outputs = this.safeJsonParse<Record<string, string[]>>(video.outputs, {
      m3u8: [],
      mp4: [],
      webm: [],
      ogv: [],
    });

    const formats = ['m3u8', 'mp4', 'webm', 'ogv'];
    const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];

    const publishes: Array<{ format: string; resolution: string; isPublished: boolean }> = [];

    for (const format of formats) {
      for (const resolution of resolutions) {
        publishes.push({
          format,
          resolution,
          isPublished: Boolean(video.isPublished) && Boolean(outputs[format]?.includes(resolution)),
        });
      }
    }

    return publishes;
  }

  /**
   * Update video bandwidth
   */
  async updateBandwidth(videoId: string, bandwidth: number): Promise<void> {
    await this.videoRepository.updateBandwidth(videoId, bandwidth);
  }

  /**
   * Mark specific format/resolution as published
   */
  async markFormatResolutionPublished(
    videoId: string,
    format: string,
    resolution: string
  ): Promise<void> {
    return this.withErrorLogging('markFormatResolutionPublished', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      // Parse existing outputs
      const outputs: Record<string, string[]> =
        typeof video.outputs === 'string'
          ? (JSON.parse(video.outputs) as Record<string, string[]>)
          : ((video.outputs as Record<string, string[]>) ?? {});

      // Add resolution to format if not already present
      if (!outputs[format]?.includes(resolution)) {
        if (!outputs[format]) {
          outputs[format] = [];
        }
        outputs[format].push(resolution);
        // Sort by resolution (descending)
        outputs[format].sort((a: string, b: string) => {
          const aRes = parseInt(a.split('p')[0] ?? '0');
          const bRes = parseInt(b.split('p')[0] ?? '0');
          return bRes - aRes;
        });
      }

      await this.videoRepository.update(videoId, { outputs: JSON.stringify(outputs) });
      this.logger.debug('Format/resolution published', { videoId, format, resolution });
    });
  }

  /**
   * Notify upload complete for a format/resolution
   */
  async notifyUploadComplete(videoId: string, format: string, resolution: string): Promise<void> {
    return this.withErrorLogging('notifyUploadComplete', () => {
      this.logger.debug('Upload complete notification', { videoId, format, resolution });
      // Trigger any necessary cache purging or notifications
      // The actual implementation depends on Cloudflare integration
      return Promise.resolve();
    });
  }

  /**
   * Notify stream complete for a format/resolution
   */
  async notifyStreamComplete(videoId: string, format: string, resolution: string): Promise<void> {
    return this.withErrorLogging('notifyStreamComplete', () => {
      this.logger.debug('Stream complete notification', { videoId, format, resolution });
      // The actual implementation depends on stream handling logic
      return Promise.resolve();
    });
  }

  /**
   * Get source file extension
   */
  async getSourceFileExtension(videoId: string): Promise<string | null> {
    const video = await this.videoRepository.findById(videoId);
    return video?.sourceFileExtension ?? null;
  }

  /**
   * Get all publish statuses for video formats/resolutions
   */
  async getPublishes(
    videoId: string
  ): Promise<Array<{ format: string; resolution: string; isPublished: boolean }> | null> {
    return this.withErrorLogging('getPublishes', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return null;
      }

      // Parse existing outputs
      const outputs: Record<string, string[]> =
        typeof video.outputs === 'string'
          ? (JSON.parse(video.outputs) as Record<string, string[]>)
          : ((video.outputs as Record<string, string[]>) ?? {});

      // Build complete publish status list
      const formats = ['m3u8', 'mp4', 'webm', 'ogv'];
      const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];

      const publishes: Array<{ format: string; resolution: string; isPublished: boolean }> = [];

      for (const format of formats) {
        for (const resolution of resolutions) {
          publishes.push({
            format,
            resolution,
            isPublished:
              video.isPublished === true && (outputs[format]?.includes(resolution) ?? false),
          });
        }
      }

      return publishes;
    });
  }

  /**
   * Unpublish a specific format/resolution
   */
  async unpublishFormatResolution(
    videoId: string,
    format: string,
    resolution: string
  ): Promise<void> {
    return this.withErrorLogging('unpublishFormatResolution', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      // Parse existing outputs
      const outputs: Record<string, string[]> =
        typeof video.outputs === 'string'
          ? (JSON.parse(video.outputs) as Record<string, string[]>)
          : ((video.outputs as Record<string, string[]>) ?? {});

      // Remove resolution from format
      if (outputs[format]) {
        outputs[format] = outputs[format].filter((item: string) => item !== resolution);
      }

      await this.videoRepository.update(videoId, { outputs: JSON.stringify(outputs) });

      // Delete the files from storage
      this.deleteFormatResolutionFiles(videoId, format, resolution);

      this.logger.info('Format/resolution unpublished', { videoId, format, resolution });
    });
  }

  /**
   * Delete format/resolution files from storage
   */
  private deleteFormatResolutionFiles(videoId: string, format: string, resolution: string): void {
    try {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;

        if (format === 'm3u8') {
          // Delete manifest and segments
          const manifestPath = path.join(
            videosDir,
            videoId,
            'adaptive',
            format,
            `manifest-${resolution}.m3u8`
          );
          const segmentsDir = path.join(videosDir, videoId, 'adaptive', format, resolution);

          if (fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
          }
          if (fs.existsSync(segmentsDir)) {
            fs.rmSync(segmentsDir, { recursive: true, force: true });
          }
        } else {
          // Delete progressive video file
          const videoPath = path.join(
            videosDir,
            videoId,
            'progressive',
            format,
            `${resolution}.${format}`
          );
          if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
          }
        }

        this.logger.debug('Deleted format/resolution files', { videoId, format, resolution });
      }
      // For S3, use storage service
    } catch (error) {
      this.logger.error('Failed to delete format/resolution files', error as Error, {
        videoId,
        format,
        resolution,
      });
      // Don't throw - record update should still succeed
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate a unique video ID (YouTube-like format)
   */
  private async generateUniqueVideoId(): Promise<string> {
    let isUnique = false;
    let videoId = '';

    while (!isUnique) {
      videoId = this.generateId(11);

      // Check if ID already exists
      const existing = await this.videoRepository.findById(videoId);
      if (!existing) {
        isUnique = true;
      }
    }

    return videoId;
  }

  /**
   * Create storage directories for a video
   */
  private createVideoStorageDirectories(videoId: string): void {
    try {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;
        const videoDir = path.join(videosDir, videoId);

        fs.mkdirSync(path.join(videoDir, 'images'), { recursive: true });
        fs.mkdirSync(path.join(videoDir, 'adaptive'), { recursive: true });
        fs.mkdirSync(path.join(videoDir, 'progressive'), { recursive: true });

        this.logger.debug('Created video directories', { videoId, path: videoDir });
      }
      // For S3, directories are virtual and created on-demand
    } catch (error) {
      this.logger.error('Failed to create video directories', error as Error, { videoId });
      throw error;
    }
  }

  /**
   * Delete storage directories for a video
   */
  private async deleteVideoStorageDirectories(videoId: string): Promise<void> {
    try {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;
        const videoDir = path.join(videosDir, videoId);

        if (fs.existsSync(videoDir)) {
          fs.rmSync(videoDir, { recursive: true, force: true });
          this.logger.debug('Deleted video directories', { videoId });
        }
      } else if (storageMode === 's3provider' && this.storageService) {
        // Delete from S3
        await this.storageService.deleteDirectory(`external/videos/${videoId}`);
        this.logger.debug('Deleted video from S3', { videoId });
      }
    } catch (error) {
      this.logger.error('Failed to delete video directories', error as Error, { videoId });
      // Don't throw - video record deletion should still proceed
    }
  }

  /**
   * Broadcast video event via WebSocket
   */
  private broadcastVideoEvent(eventName: string, payload: Record<string, unknown>): void {
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
