/**
 * Videos Service
 *
 * Service layer for video-related business logic including CRUD operations,
 * publishing workflows, and metadata management.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BaseService, type ServiceOptions } from './base.js';
import type {
  IVideoService,
  GetVideosOptions,
  CreateVideoInput,
  UpdateVideoInput,
  IStorageService,
  IWebSocketService,
  ICloudflareService,
  IIndexerService,
  VideoWatchData,
  VideoSource,
  SourcesFormatsAndResolutions,
  VideoPermissions,
  VideoData,
  AddToIndexOptions,
  AddToIndexResult,
  VideoIndexData,
} from './interfaces.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { CommentsRepository } from '../database/repositories/comments.js';
import type { DrizzleVideo, DrizzleNewVideo } from '../database/schemas/index.js';
import type { PaginatedResult } from '../types/models.js';
import { getConfig } from '../config/index.js';

/**
 * Videos service dependencies
 */
export interface VideosServiceDependencies {
  videoRepository: VideosRepository;
  commentRepository?: CommentsRepository;
  storageService?: IStorageService;
  websocketService?: IWebSocketService;
  cloudflareService?: ICloudflareService;
  indexerService?: IIndexerService;
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
  private readonly cloudflareService: ICloudflareService | undefined;
  private readonly indexerService: IIndexerService | undefined;

  // Debounced view counter - tracks pending views per video
  private readonly pendingViews: Map<string, number> = new Map();
  private readonly viewTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private static readonly VIEW_DEBOUNCE_MS = 500;

  constructor(
    videoRepository: VideosRepository,
    commentRepository?: CommentsRepository,
    storageService?: IStorageService,
    websocketService?: IWebSocketService,
    cloudflareService?: ICloudflareService,
    indexerService?: IIndexerService,
    options?: ServiceOptions
  ) {
    super('VideosService', options);
    this.videoRepository = videoRepository;
    this.commentRepository = commentRepository;
    this.storageService = storageService;
    this.websocketService = websocketService;
    this.cloudflareService = cloudflareService;
    this.indexerService = indexerService;
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

      // Build query options, omitting undefined values
      const queryOptions: {
        limit?: number;
        sortBy?: 'creation_timestamp' | 'views' | 'likes' | 'title';
        sortDirection?: 'asc' | 'desc';
        isPublished?: boolean;
        isStreaming?: boolean;
        isFinalized?: boolean;
        search?: string;
        tagTerm?: string;
        timestamp?: number;
      } = {};

      if (options?.limit !== undefined) {
        queryOptions.limit = options.limit;
      }
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
      if (options?.tagTerm !== undefined) {
        queryOptions.tagTerm = options.tagTerm;
      }
      if (options?.timestamp !== undefined) {
        queryOptions.timestamp = options.timestamp;
      }

      // Query videos with filters
      const videos = await this.videoRepository.findAll(queryOptions);

      // Build count options, omitting undefined values
      const countOptions: {
        isPublished?: boolean;
        isStreaming?: boolean;
        isFinalized?: boolean;
        search?: string;
        tagTerm?: string;
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
      if (options?.tagTerm !== undefined) {
        countOptions.tagTerm = options.tagTerm;
      }

      // Get total count for pagination
      const total = await this.videoRepository.getCount(countOptions);

      return {
        data: videos,
        total,
        count: videos.length,
        limit,
        hasMore: videos.length === limit,
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
        video_id: videoId,
        source_file_extension: '',
        title: data.title,
        description: data.description,
        tags: tagsSanitized,
        length_seconds: 0,
        length_timestamp: '',
        views: 0,
        comments: 0,
        likes: 0,
        dislikes: 0,
        bandwidth: 0,
        is_importing: true,
        is_imported: false,
        is_publishing: false,
        is_published: false,
        is_streaming: false,
        is_streamed: false,
        is_stream_recorded_remotely: false,
        is_stream_recorded_locally: false,
        is_live: false,
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
        meta,
        creation_timestamp: creationTimestamp,
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

      const updates = this.buildVideoUpdateObject(data, existingVideo);

      this.logger.debug('Updating video', { videoId, fields: Object.keys(updates) });

      const updatedVideo = await this.videoRepository.update(videoId, updates);

      // Purge Cloudflare cache after update
      if (this.cloudflareService) {
        try {
          await this.cloudflareService.purgeEmbedVideoPages([videoId]);
          await this.cloudflareService.purgeWatchPages([videoId]);
          await this.cloudflareService.purgeNodePage();
        } catch (error) {
          this.logger.warn('Failed to purge Cloudflare cache after video update', {
            videoId,
            error,
          });
        }
      }

      return updatedVideo;
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

      // Purge Cloudflare cache before deletion
      if (this.cloudflareService) {
        try {
          await this.cloudflareService.purgeNodePage();
          await this.cloudflareService.purgeEmbedVideoPages([videoId]);
          await this.cloudflareService.purgeAdaptiveVideos(videoId);
          await this.cloudflareService.purgeProgressiveVideos(videoId);
          await this.cloudflareService.purgeAllWatchPages();
          await this.cloudflareService.purgeVideoThumbnailImages([videoId]);
          await this.cloudflareService.purgeVideoPreviewImages([videoId]);
          await this.cloudflareService.purgeVideoPosterImages([videoId]);
        } catch (error) {
          this.logger.warn('Failed to purge Cloudflare cache during video deletion', {
            videoId,
            error,
          });
        }
      }

      // Delete video record
      return this.videoRepository.delete(videoId);
    });
  }

  /**
   * Mark video as importing
   */
  async setImporting(videoId: string, isImporting: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { is_importing: isImporting });
  }

  /**
   * Mark video as imported (import complete)
   */
  async setImported(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      is_importing: false,
      is_imported: true,
    });
  }

  /**
   * Mark video as publishing
   */
  async setPublishing(videoId: string, isPublishing: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { is_publishing: isPublishing });
  }

  /**
   * Publish a video
   */
  async publishVideo(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      is_publishing: false,
      is_published: true,
    });

    // Purge Cloudflare cache after publishing
    if (this.cloudflareService) {
      try {
        await this.cloudflareService.purgeNodePage();
        await this.cloudflareService.purgeWatchPages([videoId]);
        await this.cloudflareService.purgeEmbedVideoPages([videoId]);
      } catch (error) {
        this.logger.warn('Failed to purge Cloudflare cache after publishing', { videoId, error });
      }
    }

    this.logger.info('Video published', { videoId });
  }

  /**
   * Unpublish a video
   */
  async unpublishVideo(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      is_published: false,
    });

    // Purge Cloudflare cache after unpublishing
    if (this.cloudflareService) {
      try {
        await this.cloudflareService.purgeAllEmbedVideoPages();
        await this.cloudflareService.purgeAllWatchPages();
        await this.cloudflareService.purgeVideo(videoId);
      } catch (error) {
        this.logger.warn('Failed to purge Cloudflare cache after unpublishing', { videoId, error });
      }
    }

    this.logger.info('Video unpublished', { videoId });
  }

  /**
   * Increment view count
   */
  async incrementViews(videoId: string): Promise<void> {
    await this.videoRepository.incrementViews(videoId);
  }

  /**
   * Increment view count with debouncing
   *
   * Batches multiple view increments into a single database write after 500ms.
   * Returns the current view count including pending views.
   */
  async incrementViewsDebounced(videoId: string): Promise<{ views: number }> {
    return this.withErrorLogging('incrementViewsDebounced', async () => {
      // Increment pending views for this video
      const currentPending = this.pendingViews.get(videoId) ?? 0;
      this.pendingViews.set(videoId, currentPending + 1);

      // Clear existing timer for this video
      const existingTimer = this.viewTimers.get(videoId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounce timer
      const timer = setTimeout(() => {
        const pendingCount = this.pendingViews.get(videoId) ?? 0;
        if (pendingCount > 0) {
          this.pendingViews.delete(videoId);
          this.viewTimers.delete(videoId);

          this.videoRepository
            .incrementViewsBy(videoId, pendingCount)
            .then(() => {
              this.logger.debug('Flushed pending views', { videoId, count: pendingCount });
            })
            .catch((err: unknown) => {
              this.logger.error(
                'Failed to flush pending views',
                err instanceof Error ? err : new Error(String(err)),
                { videoId, count: pendingCount }
              );
            });
        }
      }, VideosService.VIEW_DEBOUNCE_MS);

      this.viewTimers.set(videoId, timer);

      // Get current database view count
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error('Video not found');
      }

      // Return current count + pending
      const pendingCount = this.pendingViews.get(videoId) ?? 0;
      return { views: video.views + pendingCount };
    });
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
      is_finalized: true,
    });

    this.logger.info('Video finalized', { videoId });
  }

  /**
   * Set video error state
   */
  async setError(videoId: string, isError: boolean): Promise<void> {
    await this.videoRepository.update(videoId, { is_error: isError });

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
      is_indexed: isIndexed,
      is_index_outdated: false,
      is_indexing: false,
    });
  }

  /**
   * Mark video index as outdated
   */
  async setIndexOutdated(videoId: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      is_index_outdated: true,
    });
  }

  /**
   * Mark video index as outdated (with Cloudflare cache purge)
   *
   * Also purges thumbnail, preview, and poster images from Cloudflare cache
   */
  async markIndexOutdated(videoId: string): Promise<void> {
    return this.withErrorLogging('markIndexOutdated', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      // Only mark as outdated if currently indexed
      if (video.is_indexed) {
        await this.videoRepository.update(videoId, {
          is_index_outdated: true,
        });

        // Purge Cloudflare cache for images
        if (this.cloudflareService) {
          await this.cloudflareService.purgeVideoThumbnailImages([videoId]);
          await this.cloudflareService.purgeVideoPreviewImages([videoId]);
          await this.cloudflareService.purgeVideoPosterImages([videoId]);
        }
      }
    });
  }

  /**
   * Set video source file extension
   */
  async setSourceFileExtension(videoId: string, extension: string): Promise<void> {
    await this.videoRepository.update(videoId, {
      source_file_extension: extension,
    });
  }

  /**
   * Update video length
   *
   * Also marks index as outdated if video is indexed
   */
  async setVideoLength(
    videoId: string,
    lengthSeconds: number,
    lengthTimestamp: string
  ): Promise<void> {
    const video = await this.videoRepository.findById(videoId);

    const updates: Record<string, unknown> = {
      length_seconds: lengthSeconds,
      length_timestamp: lengthTimestamp,
    };

    // Mark index as outdated if video is indexed
    if (video?.is_indexed === true) {
      updates['is_index_outdated'] = true;
    }

    await this.videoRepository.update(videoId, updates);
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

    outputs[format] ??= [];

    if (!outputs[format].includes(resolution)) {
      outputs[format].push(resolution);

      // Sort resolutions descending by quality
      outputs[format].sort((a, b) => {
        const aHeight = Number(a.split('p')[0] ?? '0');
        const bHeight = Number(b.split('p')[0] ?? '0');
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
          isPublished: video.is_published && (outputs[format]?.includes(resolution) ?? false),
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
          : (video.outputs as Record<string, string[]>);

      // Add resolution to format if not already present
      if (outputs[format]?.includes(resolution) !== true) {
        outputs[format] ??= [];
        outputs[format].push(resolution);
        // Sort by resolution (descending)
        outputs[format].sort((a: string, b: string) => {
          const aRes = Number(a.split('p')[0] ?? '0');
          const bRes = Number(b.split('p')[0] ?? '0');
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
    return video?.source_file_extension ?? null;
  }

  /**
   * Get video watch data for media player
   *
   * Builds the complete data structure needed by the video player including:
   * - Adaptive sources (HLS m3u8 manifests)
   * - Progressive sources (mp4, webm, ogv files)
   * - Source formats and resolutions matrix
   */
  async getWatchData(videoId: string): Promise<VideoWatchData | null> {
    return this.withErrorLogging('getWatchData', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return null;
      }

      const outputs = this.safeJsonParse<Record<string, string[]>>(video.outputs, {
        m3u8: [],
        mp4: [],
        webm: [],
        ogv: [],
      });

      // Determine manifest type based on streaming status
      const manifestType = video.is_streaming ? 'dynamic' : 'static';

      // Get external videos base URL
      const config = getConfig();
      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();

      const sourcesFormatsAndResolutions: SourcesFormatsAndResolutions = {
        m3u8: [],
        mp4: [],
        webm: [],
        ogv: [],
      };

      // Build sources from outputs
      const { adaptiveSources, progressiveSources } = this.buildVideoSources(
        outputs,
        videoId,
        externalVideosBaseUrl,
        manifestType,
        sourcesFormatsAndResolutions
      );

      return {
        videoId,
        title: video.title,
        description: video.description,
        views: video.views,
        likes: video.likes,
        dislikes: video.dislikes,
        isPublished: video.is_published,
        isPublishing: video.is_publishing,
        isLive: video.is_live,
        isStreaming: video.is_streaming,
        isStreamed: video.is_streamed,
        comments: video.comments,
        creationTimestamp: video.creation_timestamp,
        isHlsAvailable: (outputs['m3u8']?.length ?? 0) > 0,
        isMp4Available: (outputs['mp4']?.length ?? 0) > 0,
        isWebmAvailable: (outputs['webm']?.length ?? 0) > 0,
        isOgvAvailable: (outputs['ogv']?.length ?? 0) > 0,
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      };
    });
  }

  /**
   * Get video permissions
   */
  async getPermissions(videoId: string): Promise<VideoPermissions | null> {
    return this.withErrorLogging('getPermissions', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return null;
      }

      return {
        isCommentsEnabled: video.is_comments_enabled,
        isLikesEnabled: video.is_likes_enabled,
        isDislikesEnabled: video.is_dislikes_enabled,
        isReportsEnabled: video.is_reports_enabled,
        isLiveChatEnabled: video.is_live_chat_enabled,
      };
    });
  }

  /**
   * Get video data with formatted fields
   *
   * Returns video data with alias URL and parsed JSON fields
   */
  async getVideoData(videoId: string): Promise<VideoData | null> {
    return this.withErrorLogging('getVideoData', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return null;
      }

      return this.formatVideoData(video);
    });
  }

  /**
   * Get all videos data with formatted fields
   */
  async getAllVideosData(): Promise<VideoData[]> {
    return this.withErrorLogging('getAllVideosData', async () => {
      const videos = await this.videoRepository.findAll({});
      return videos.map((video) => this.formatVideoData(video));
    });
  }

  /**
   * Format video into VideoData structure
   */
  private formatVideoData(video: DrizzleVideo): VideoData {
    const config = getConfig();
    const nodeSettings = config.nodeSettings;

    const outputs = this.safeJsonParse<Record<string, string[]>>(video.outputs, {
      m3u8: [],
      mp4: [],
      webm: [],
      ogv: [],
    });

    const meta = this.safeJsonParse<Record<string, unknown>>(video.meta, {});

    // Build video alias URL if indexed
    let videoAliasUrl = 'MoarTube Aliaser link unavailable';

    if (video.is_indexed && nodeSettings.nodeId) {
      const isDeveloperMode = config.runtime.isDeveloperMode;
      if (isDeveloperMode) {
        // Use localhost for development
        const aliaserPort = config.urls.getAliaserConfig().port;
        videoAliasUrl = `http://localhost:${String(aliaserPort)}/nodes/${nodeSettings.nodeId}/videos/${video.video_id}`;
      } else {
        videoAliasUrl = `https://moartu.be/nodes/${nodeSettings.nodeId}/videos/${video.video_id}`;
      }
    }

    return {
      videoId: video.video_id,
      title: video.title,
      description: video.description,
      tags: video.tags,
      views: video.views,
      isIndexed: video.is_indexed,
      isPublished: video.is_published,
      isLive: video.is_live,
      isStreaming: video.is_streaming,
      isFinalized: video.is_finalized,
      isStreamRecordedRemotely: video.is_stream_recorded_remotely,
      timestamp: video.creation_timestamp,
      videoAliasUrl,
      outputs,
      meta,
    };
  }

  /**
   * Get recommended videos (published or live)
   */
  async getRecommendedVideos(): Promise<DrizzleVideo[]> {
    return this.withErrorLogging('getRecommendedVideos', async () => {
      // Get all published or live videos, ordered by creation timestamp
      const videos = await this.videoRepository.findAll({
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      });

      // Filter to only published or live videos
      return videos.filter((v) => v.is_published || v.is_live);
    });
  }

  /**
   * Get unique tags from published/live videos
   */
  async getPublishedTags(): Promise<string[]> {
    return this.withErrorLogging('getPublishedTags', async () => {
      const videos = await this.getRecommendedVideos();
      return this.extractUniqueTags(videos);
    });
  }

  /**
   * Get unique tags from all videos
   */
  async getAllTags(): Promise<string[]> {
    return this.withErrorLogging('getAllTags', async () => {
      const videos = await this.videoRepository.findAll({
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      });
      return this.extractUniqueTags(videos);
    });
  }

  /**
   * Extract unique tags from videos
   */
  private extractUniqueTags(videos: DrizzleVideo[]): string[] {
    const tagsSet = new Set<string>();

    for (const video of videos) {
      if (video.tags) {
        const tags = video.tags.split(',');
        for (const tag of tags) {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagsSet.add(trimmedTag);
          }
        }
      }
    }

    return Array.from(tagsSet);
  }

  /**
   * Get video alias URL for indexed videos
   */
  async getAliasUrl(videoId: string): Promise<string | null> {
    return this.withErrorLogging('getAliasUrl', async () => {
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        return null;
      }

      if (!video.is_indexed) {
        throw new Error('Video is not indexed');
      }

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (!nodeSettings.nodeId) {
        throw new Error('Node ID not configured');
      }

      const isDeveloperMode = config.runtime.isDeveloperMode;
      if (isDeveloperMode) {
        const aliaserPort = config.urls.getAliaserConfig().port;
        return `http://localhost:${String(aliaserPort)}/nodes/${nodeSettings.nodeId}/videos/${videoId}`;
      } else {
        return `https://moartu.be/nodes/${nodeSettings.nodeId}/videos/${videoId}`;
      }
    });
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
          : (video.outputs as Record<string, string[]>);

      // Build complete publish status list
      const formats = ['m3u8', 'mp4', 'webm', 'ogv'];
      const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];

      const publishes: Array<{ format: string; resolution: string; isPublished: boolean }> = [];

      for (const format of formats) {
        for (const resolution of resolutions) {
          publishes.push({
            format,
            resolution,
            isPublished: video.is_published && (outputs[format]?.includes(resolution) ?? false),
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
          : (video.outputs as Record<string, string[]>);

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

  /**
   * Batch delete videos with safety filters
   *
   * Only deletes videos that are NOT:
   * - importing
   * - publishing
   * - streaming
   * - indexing
   * - indexed (without force flag)
   */
  async deleteVideos(
    videoIds: string[],
    force = false
  ): Promise<{ deletedVideoIds: string[]; nonDeletedVideoIds: string[] }> {
    return this.withErrorLogging('deleteVideos', async () => {
      const deletedVideoIds: string[] = [];
      const nonDeletedVideoIds: string[] = [];

      for (const videoId of videoIds) {
        const video = await this.videoRepository.findById(videoId);
        if (!video) {
          nonDeletedVideoIds.push(videoId);
          continue;
        }

        // Safety checks - don't delete videos in active states
        const isInActiveState =
          video.is_importing ||
          video.is_publishing ||
          video.is_streaming ||
          video.is_indexing ||
          (!force && video.is_indexed);

        if (isInActiveState) {
          nonDeletedVideoIds.push(videoId);
          this.logger.debug('Skipping video deletion - in active state', {
            videoId,
            isImporting: video.is_importing,
            isPublishing: video.is_publishing,
            isStreaming: video.is_streaming,
            isIndexing: video.is_indexing,
            isIndexed: video.is_indexed,
          });
          continue;
        }

        // Perform deletion
        const deleted = await this.deleteVideo(videoId);
        if (deleted) {
          deletedVideoIds.push(videoId);
        } else {
          nonDeletedVideoIds.push(videoId);
        }
      }

      this.logger.info('Batch delete completed', {
        deleted: deletedVideoIds.length,
        skipped: nonDeletedVideoIds.length,
      });

      return { deletedVideoIds, nonDeletedVideoIds };
    });
  }

  /**
   * Batch finalize videos with safety filters
   *
   * Only finalizes videos that are NOT:
   * - importing
   * - publishing
   * - streaming
   * - indexing
   * - indexed (without force flag)
   */
  async finalizeVideos(
    videoIds: string[],
    force = false
  ): Promise<{ finalizedVideoIds: string[]; nonFinalizedVideoIds: string[] }> {
    return this.withErrorLogging('finalizeVideos', async () => {
      const finalizedVideoIds: string[] = [];
      const nonFinalizedVideoIds: string[] = [];

      for (const videoId of videoIds) {
        const video = await this.videoRepository.findById(videoId);
        if (!video) {
          nonFinalizedVideoIds.push(videoId);
          continue;
        }

        // Safety checks - don't finalize videos in active states
        const isInActiveState =
          video.is_importing ||
          video.is_publishing ||
          video.is_streaming ||
          video.is_indexing ||
          (!force && video.is_indexed);

        if (isInActiveState) {
          nonFinalizedVideoIds.push(videoId);
          this.logger.debug('Skipping video finalize - in active state', {
            videoId,
            is_importing: video.is_importing,
            is_publishing: video.is_publishing,
            is_streaming: video.is_streaming,
            is_indexing: video.is_indexing,
            is_indexed: video.is_indexed,
          });
          continue;
        }

        // Finalize = stop any active operations and mark as ready
        await this.videoRepository.update(videoId, {
          is_importing: false,
          is_publishing: false,
          is_streaming: false,
        });

        finalizedVideoIds.push(videoId);
      }

      this.logger.info('Batch finalize completed', {
        finalized: finalizedVideoIds.length,
        skipped: nonFinalizedVideoIds.length,
      });

      return { finalizedVideoIds, nonFinalizedVideoIds };
    });
  }

  /**
   * Write HLS master manifest for adaptive streaming
   *
   * Writes the M3U8 master manifest file to:
   * {videosDir}/{videoId}/adaptive/m3u8/manifest-{type}.m3u8
   */
  async writeMasterManifest(videoId: string, manifestType: string, content: string): Promise<void> {
    return this.withErrorLogging('writeMasterManifest', async () => {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const videosDir = config.paths.videosDirectoryPath;
        const manifestDir = path.join(videosDir, videoId, 'adaptive', 'm3u8');

        // Ensure directory exists
        fs.mkdirSync(manifestDir, { recursive: true });

        const manifestPath = path.join(manifestDir, `manifest-master.m3u8`);
        fs.writeFileSync(manifestPath, content);

        this.logger.debug('Wrote HLS master manifest', {
          videoId,
          manifestType,
          path: manifestPath,
        });
      } else if (this.storageService) {
        const key = `external/videos/${videoId}/adaptive/m3u8/manifest-master.m3u8`;
        await this.storageService.saveFile(key, Buffer.from(content), 'application/x-mpegURL');

        this.logger.debug('Wrote HLS master manifest to S3', {
          videoId,
          manifestType,
          key,
        });
      }
    });
  }

  /**
   * Purge Cloudflare cache for video images
   */
  async purgeVideoImageCache(videoId: string): Promise<void> {
    if (this.cloudflareService) {
      await this.cloudflareService.purgeVideoThumbnailImages([videoId]);
      await this.cloudflareService.purgeVideoPreviewImages([videoId]);
      await this.cloudflareService.purgeVideoPosterImages([videoId]);
    }
  }

  /**
   * Get node icon as base64 encoded PNG
   *
   * Returns custom icon if exists, otherwise the default icon
   */
  getNodeIconPngBase64(): string {
    const config = getConfig();
    const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'icon.png');
    const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'icon.png');

    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath).toString('base64');
    }
    return fs.readFileSync(defaultPath).toString('base64');
  }

  /**
   * Get node avatar as base64 encoded PNG
   *
   * Returns custom avatar if exists, otherwise the default avatar
   */
  getNodeAvatarPngBase64(): string {
    const config = getConfig();
    const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'avatar.png');
    const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'avatar.png');

    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath).toString('base64');
    }
    return fs.readFileSync(defaultPath).toString('base64');
  }

  /**
   * Get video preview image as base64 encoded JPG
   *
   * Supports both filesystem and S3 storage modes
   */
  async getVideoPreviewJpgBase64(videoId: string): Promise<string> {
    return this.withErrorLogging('getVideoPreviewJpgBase64', async () => {
      const config = getConfig();
      const storageMode = config.nodeSettings.storageConfig.storageMode;

      if (storageMode === 'filesystem') {
        const previewPath = path.join(
          config.paths.videosDirectoryPath,
          videoId,
          'images',
          'preview.jpg'
        );

        if (!fs.existsSync(previewPath)) {
          throw new Error('Video preview image not found');
        }

        return fs.readFileSync(previewPath).toString('base64');
      } else {
        // Use storage service for S3
        if (!this.storageService) {
          throw new Error('Storage service not available for S3 mode');
        }

        const key = `external/videos/${videoId}/images/preview.jpg`;
        const buffer = await this.storageService.getFile(key);
        return buffer.toString('base64');
      }
    });
  }

  /**
   * Add video to MoarTube index
   *
   * Performs node identification, gathers video and node data,
   * and submits to the MoarTube indexer
   */
  async addToIndex(videoId: string, options: AddToIndexOptions): Promise<AddToIndexResult> {
    return this.withErrorLogging('addToIndex', async () => {
      if (!this.indexerService) {
        throw new Error('Indexer service not available');
      }

      // Validate terms of service agreement
      if (!options.termsOfServiceAgreed) {
        throw new Error('Terms of service must be agreed to');
      }

      // Get video and validate it's in a valid state
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error('Video not found');
      }

      if (!video.is_published && !video.is_live) {
        throw new Error('Video must be published or live to be indexed');
      }

      // Perform node identification
      await this.indexerService.performNodeIdentification();

      // Get config and node settings
      const config = getConfig();
      const nodeSettings = config.nodeSettings;
      const nodeIdentification = config.nodeIdentification;

      if (
        nodeIdentification?.moarTubeTokenProof === undefined ||
        nodeIdentification.moarTubeTokenProof === ''
      ) {
        throw new Error('Node identification failed - no token proof');
      }

      // Get image data
      const nodeIconPngBase64 = this.getNodeIconPngBase64();
      const nodeAvatarPngBase64 = this.getNodeAvatarPngBase64();
      const videoPreviewJpgBase64 = await this.getVideoPreviewJpgBase64(videoId);

      // Prepare submission data
      const indexData: VideoIndexData = {
        videoId: video.video_id,
        nodeId: nodeSettings.nodeId,
        nodeName: nodeSettings.nodeName,
        nodeAbout: nodeSettings.nodeAbout,
        publicNodeProtocol: nodeSettings.publicNodeProtocol,
        publicNodeAddress: nodeSettings.publicNodeAddress,
        publicNodePort: nodeSettings.publicNodePort,
        title: video.title,
        tags: video.tags,
        views: video.views,
        isLive: video.is_live,
        isStreaming: video.is_streaming,
        lengthSeconds: video.length_seconds,
        creationTimestamp: video.creation_timestamp,
        containsAdultContent: options.containsAdultContent,
        nodeIconPngBase64,
        nodeAvatarPngBase64,
        videoPreviewJpgBase64,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
        cloudflareTurnstileToken: options.cloudflareTurnstileToken,
      };

      // Mark video as indexing
      await this.videoRepository.update(videoId, { is_indexing: true });

      // Submit to indexer
      const result = await this.indexerService.submitVideoToIndex(indexData);

      if (result.isError) {
        // Reset indexing state on error
        await this.videoRepository.update(videoId, { is_indexing: false });

        // Check for 413 (request too large)
        if (result.statusCode === 413) {
          return {
            success: false,
            message: result.message,
            isRequestTooLarge: true,
          };
        }

        return {
          success: false,
          message: result.message ?? 'Failed to add video to index',
        };
      }

      // Mark video as indexed
      await this.videoRepository.update(videoId, {
        is_indexing: false,
        is_indexed: true,
        is_index_outdated: false,
      });

      this.logger.info('Video added to index', { videoId });

      return { success: true };
    });
  }

  /**
   * Remove video from MoarTube index
   */
  async removeFromIndex(videoId: string, cloudflareTurnstileToken: string): Promise<void> {
    return this.withErrorLogging('removeFromIndex', async () => {
      if (!this.indexerService) {
        throw new Error('Indexer service not available');
      }

      // Get video and validate
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        throw new Error('Video not found');
      }

      // Perform node identification
      await this.indexerService.performNodeIdentification();

      // Get node identification
      const config = getConfig();
      const nodeIdentification = config.nodeIdentification;

      if (
        nodeIdentification?.moarTubeTokenProof === undefined ||
        nodeIdentification.moarTubeTokenProof === ''
      ) {
        throw new Error('Node identification failed - no token proof');
      }

      // Remove from indexer
      await this.indexerService.removeVideoFromIndex({
        videoId,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
        cloudflareTurnstileToken,
      });

      // Update video record
      await this.videoRepository.update(videoId, {
        is_indexed: false,
        is_index_outdated: false,
      });

      this.logger.info('Video removed from index', { videoId });
    });
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
      } else if (this.storageService) {
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

  /**
   * Build update object for video metadata
   */
  private buildVideoUpdateObject(
    data: UpdateVideoInput,
    existingVideo: DrizzleVideo
  ): Partial<DrizzleNewVideo> {
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
      updates.is_published = data.isPublished;
    }
    if (data.isHidden !== undefined) {
      updates.is_hidden = data.isHidden;
    }
    if (data.isPassworded !== undefined) {
      updates.is_passworded = data.isPassworded;
    }
    if (data.password !== undefined) {
      updates.password = data.password;
    }
    if (data.isCommentsEnabled !== undefined) {
      updates.is_comments_enabled = data.isCommentsEnabled;
    }
    if (data.isLikesEnabled !== undefined) {
      updates.is_likes_enabled = data.isLikesEnabled;
    }
    if (data.isDislikesEnabled !== undefined) {
      updates.is_dislikes_enabled = data.isDislikesEnabled;
    }
    if (data.isReportsEnabled !== undefined) {
      updates.is_reports_enabled = data.isReportsEnabled;
    }
    if (data.isLiveChatEnabled !== undefined) {
      updates.is_live_chat_enabled = data.isLiveChatEnabled;
    }

    // Mark index as outdated if metadata changed and video is indexed
    if (
      existingVideo.is_indexed &&
      (data.title !== undefined || data.description !== undefined || data.tags !== undefined)
    ) {
      updates.is_index_outdated = true;
    }

    return updates;
  }

  /**
   * Build adaptive and progressive sources from video outputs
   */
  private buildVideoSources(
    outputs: Record<string, string[]>,
    videoId: string,
    externalVideosBaseUrl: string,
    manifestType: string,
    sourcesFormatsAndResolutions: SourcesFormatsAndResolutions
  ): { adaptiveSources: VideoSource[]; progressiveSources: VideoSource[] } {
    const adaptiveSources: VideoSource[] = [];
    const progressiveSources: VideoSource[] = [];

    // Build sources from outputs
    for (const format of Object.keys(outputs)) {
      const resolutions = outputs[format] ?? [];

      for (const resolution of resolutions) {
        if (format === 'm3u8') {
          // Adaptive streaming source (HLS)
          const src = `${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/${manifestType}/manifests/manifest-${resolution}.m3u8`;
          adaptiveSources.push({ src, type: 'application/vnd.apple.mpegurl' });
        } else {
          // Progressive download source
          const src = `${externalVideosBaseUrl}/external/videos/${videoId}/progressive/${format}/${resolution}.${format}`;
          const type = this.getVideoMimeType(format);

          if (type !== null) {
            progressiveSources.push({ src, type });
          }
        }

        // Track format/resolution availability
        if (format in sourcesFormatsAndResolutions) {
          sourcesFormatsAndResolutions[format as keyof SourcesFormatsAndResolutions].push(
            resolution
          );
        }
      }
    }

    // Add master manifest at the beginning if adaptive sources exist
    if (adaptiveSources.length > 0) {
      const masterSrc = `${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/${manifestType}/manifests/manifest-master.m3u8`;
      adaptiveSources.unshift({ src: masterSrc, type: 'application/vnd.apple.mpegurl' });
    }

    return { adaptiveSources, progressiveSources };
  }

  /**
   * Get MIME type for video format
   */
  private getVideoMimeType(format: string): string | null {
    switch (format) {
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'ogv':
        return 'video/ogg';
      default:
        return null;
    }
  }
}
