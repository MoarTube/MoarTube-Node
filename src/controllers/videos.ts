/**
 * Videos Controller
 *
 * Handles HTTP requests for video-related operations.
 */

import * as fs from 'node:fs';
import { writeUpload } from '@/utils/stream-files.js';
import * as path from 'node:path';
import {
  readCachedComments,
  COMMENT_STATE_CACHE_CONTROL,
  type CommentCacheState,
} from '@/utils/comment-cache.js';
import { pageOptions } from '@/utils/pagination.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { ReportType } from '@services/interfaces.js';
import type {
  VideosService,
  CloudflareService,
  CommentsService,
  VideoUploadService,
  ReportsService,
} from '@services/index.js';
import {
  type VideoMasterManifestBody,
  type VideoAdaptiveManifestParams,
} from '@validators/index.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '@errors/index.js';
import { getConfig } from '@config/index.js';

// Local type definitions
interface UpdateVideoInput {
  title?: string;
  description?: string;
  tags?: string;
  isPublished?: boolean;
  isHidden?: boolean;
  isPassworded?: boolean;
  password?: string;
  isCommentsEnabled?: boolean;
  isLikesEnabled?: boolean;
  isDislikesEnabled?: boolean;
  isReportsEnabled?: boolean;
  isLiveChatEnabled?: boolean;
}

/**
 * Request body/query/params type definitions
 */
interface VideoIdParams {
  videoId: string;
}

interface VideoSearchQuery {
  searchTerm?: string;
  sortTerm: 'latest' | 'popular' | 'oldest';
  tagTerm?: string;
  tagLimit: number;
  timestamp: number;
}

interface VideoImportBody {
  title: string;
  description: string;
  tags: string;
}

interface VideoUpdateBody {
  title?: string;
  description?: string;
  tags?: string;
}

interface VideoCommentsQuery {
  knownIds?: string;
  includeTotal?: '1';
  beforeId?: number;
  afterId?: number;
  timestamp: number;
  type: 'before' | 'after';
  sort: 'ascending' | 'descending';
}

interface CommentBody {
  commentPlainText: string;
  timestamp: number;
  cloudflareTurnstileToken?: string;
}

interface LikeDislikeBody {
  cloudflareTurnstileToken?: string;
}

interface ReportBody {
  email: string;
  reportType: ReportType;
  message: string;
  cloudflareTurnstileToken?: string;
}

interface FormatResolutionBody {
  format: 'm3u8' | 'mp4' | 'webm' | 'ogv';
  resolution: '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p';
}

interface SourceFileExtensionBody {
  sourceFileExtension: string;
}

interface UploadQueryParams {
  format: string;
  resolution: string;
}

type ImageType = 'thumbnail' | 'preview' | 'poster';

/**
 * VideosController class
 *
 * Handles all video-related HTTP endpoints including:
 * - Video CRUD operations
 * - Video search and listing
 * - Video interactions (likes, dislikes, comments)
 * - Video publishing workflow
 * - Video import/export workflow
 */
export class VideosController extends BaseController {
  private readonly videosService: VideosService;
  private readonly commentsService: CommentsService;
  private readonly videoUploadService: VideoUploadService;
  private readonly cloudflareService: CloudflareService;
  private readonly reportsService: ReportsService;

  constructor(
    videosService: VideosService,
    commentsService: CommentsService,
    videoUploadService: VideoUploadService,
    cloudflareService: CloudflareService,
    reportsService: ReportsService
  ) {
    super('VideosController');
    this.videosService = videosService;
    this.commentsService = commentsService;
    this.videoUploadService = videoUploadService;
    this.cloudflareService = cloudflareService;
    this.reportsService = reportsService;
  }

  /**
   * Import a new video
   * POST /videos/import
   */
  importVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { title, description, tags } = request.body as VideoImportBody;

      const result = await this.videosService.createVideo({ title, description, tags });

      return await this.sendSuccess(reply, result);
    } catch (error) {
      this.logger.error('VideosController.importVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as imported (import complete)
   * POST /videos/imported
   *
   * Takes videoId from request body (legacy route)
   */
  videoImportedFromBody = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.body as { videoId: string };

      await this.videosService.setImported(videoId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('VideosController.videoImportedFromBody failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Start publishing process
   * POST /videos/publishing
   *
   * Takes videoId from request body (legacy route)
   */
  startPublishingFromBody = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.body as { videoId: string };

      await this.videosService.setPublishing(videoId, true);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('VideosController.startPublishingFromBody failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as published (publishing complete)
   * POST /videos/published
   *
   * Takes videoId from request body (legacy route)
   */
  videoPublishedFromBody = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.body as { videoId: string };

      await this.videosService.setPublishing(videoId, false);
      await this.videosService.publishVideo(videoId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('VideosController.videoPublishedFromBody failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as imported (import complete)
   * POST /videos/:videoId/imported
   */
  videoImported = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setImported(videoId);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.videoImported failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Stop video import process
   * POST /videos/:videoId/importing/stop
   */
  stopImporting = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setImporting(videoId, false);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.stopImporting failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as publishing (start publishing)
   * POST /videos/:videoId/publishing
   */
  startPublishing = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setPublishing(videoId, true);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.startPublishing failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as published (publishing complete)
   * POST /videos/:videoId/published
   */
  videoPublished = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setPublishing(videoId, false);
      await this.videosService.publishVideo(videoId);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.videoPublished failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark specific format/resolution as published
   * POST /videos/:videoId/format-resolution/published
   */
  formatResolutionPublished = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.body as FormatResolutionBody;

      await this.videosService.markFormatResolutionPublished(videoId, format, resolution);

      return await this.sendSuccess(reply, { videoId, format, resolution });
    } catch (error) {
      this.logger.error('VideosController.formatResolutionPublished failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Stop video publishing process
   * POST /videos/:videoId/publishing/stop
   */
  stopPublishing = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setPublishing(videoId, false);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.stopPublishing failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Notify video upload complete
   * POST /videos/:videoId/upload
   */
  videoUploaded = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.body as FormatResolutionBody;

      await this.videosService.notifyUploadComplete(videoId, format, resolution);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.videoUploaded failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Notify video stream complete
   * POST /videos/:videoId/stream
   */
  videoStreamed = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.body as FormatResolutionBody;

      await this.videosService.notifyStreamComplete(videoId, format, resolution);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.videoStreamed failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as error state
   * POST /videos/:videoId/error
   */
  videoError = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.setError(videoId, true);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.videoError failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Mark video as error state (videoId from body)
   * POST /videos/error
   *
   * This is the legacy route that takes videoId from request body
   */
  setErrorFromBody = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.body as { videoId: string };

      await this.videosService.setError(videoId, true);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('VideosController.setErrorFromBody failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Set video source file extension
   * POST /videos/:videoId/source-file-extension
   */
  setSourceFileExtension = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { sourceFileExtension } = request.body as SourceFileExtensionBody;

      await this.videosService.setSourceFileExtension(videoId, sourceFileExtension);

      return await this.sendSuccess(reply, { videoId, sourceFileExtension });
    } catch (error) {
      this.logger.error('VideosController.setSourceFileExtension failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get video source file extension
   * GET /videos/:videoId/source-file-extension
   */
  getSourceFileExtension = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const sourceFileExtension = await this.videosService.getSourceFileExtension(videoId);

      return await this.sendSuccess(reply, { sourceFileExtension });
    } catch (error) {
      this.logger.error('VideosController.getSourceFileExtension failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get video publish status for all formats/resolutions
   * GET /videos/:videoId/publishes
   */
  getPublishes = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const publishes = await this.videosService.getPublishes(videoId);

      if (publishes === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, { publishes });
    } catch (error) {
      this.logger.error('VideosController.getPublishes failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Unpublish specific format/resolution
   * POST /videos/:videoId/unpublish
   */
  unpublishFormatResolution = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.body as FormatResolutionBody;

      await this.videosService.unpublishFormatResolution(videoId, format, resolution);

      return await this.sendSuccess(reply, { videoId, format, resolution });
    } catch (error) {
      this.logger.error('VideosController.unpublishFormatResolution failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get a single video by ID
   * GET /videos/:videoId
   */
  getVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const video = await this.videosService.getVideo(videoId);

      if (video === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, video);
    } catch (error) {
      this.logger.error('VideosController.getVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Search/list videos
   * GET /videos/search
   */
  searchVideos = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { searchTerm, sortTerm, tagTerm, tagLimit, timestamp } =
        request.query as VideoSearchQuery;

      // Map sort term to sort options
      let sortBy: 'creation_timestamp' | 'views' | 'likes' | 'title' = 'creation_timestamp';
      let sortDirection: 'asc' | 'desc' = 'desc';

      if (sortTerm === 'popular') {
        sortBy = 'views';
      } else if (sortTerm === 'oldest') {
        sortDirection = 'asc';
      }

      // Build options, only include search if defined
      const options = {
        sortBy,
        sortDirection,
        limit: tagLimit,
        timestamp,
        ...(searchTerm !== undefined ? { search: searchTerm } : {}),
        ...(tagTerm !== undefined ? { tagTerm } : {}),
      };

      const result = await this.videosService.getVideos(options);

      return await this.sendSuccess(reply, {
        videos: result.data,
        timestamp: timestamp,
      });
    } catch (error) {
      this.logger.error('VideosController.searchVideos failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Update video metadata
   * POST /videos/:videoId/data
   */
  updateVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { title, description, tags } = request.body as VideoUpdateBody;

      // Build update data, only include defined properties
      const updateData = {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(tags !== undefined ? { tags } : {}),
      };

      const video = await this.videosService.updateVideo(videoId, updateData);

      if (video === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, { video });
    } catch (error) {
      this.logger.error('VideosController.updateVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Delete a video
   * POST /videos/:videoId/delete
   */
  deleteVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const deleted = await this.videosService.deleteVideo(videoId);

      if (!deleted) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.deleteVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Finalize video after upload
   * POST /videos/:videoId/finalize
   */
  finalizeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.finalizeVideo(videoId);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.finalizeVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Increment view count with debouncing
   * POST /videos/:videoId/view
   *
   * Uses debounced counter to batch DB writes for performance
   */
  incrementViews = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      // Get current view count including pending
      const result = await this.videosService.incrementViewsDebounced(videoId);

      return await this.sendSuccess(reply, { views: result.views });
    } catch (error) {
      this.logger.error('VideosController.incrementViews failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Like a video
   * POST /videos/:videoId/like
   *
   * Validates global and video-level like settings, plus Turnstile if enabled
   */
  likeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { cloudflareTurnstileToken } = (request.body ?? {}) as LikeDislikeBody;

      // Check global setting
      const config = getConfig();

      if (!config.nodeSettings.isLikesEnabled) {
        throw new ForbiddenError('Liking is currently disabled');
      }

      // Validate Turnstile if enabled
      await this.validateTurnstileIfEnabled(request, cloudflareTurnstileToken);

      // Check video exists and video-level setting
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError('Video not found');
      }

      if (!video.is_likes_enabled) {
        throw new ForbiddenError('Likes are currently disabled for this video');
      }

      // Increment like count
      await this.videosService.incrementLikes(videoId);

      // Purge cache
      await this.cloudflareService.purgeWatchPages([videoId]);

      // Return updated counts
      const updatedVideo = await this.videosService.getVideo(videoId);
      return await this.sendSuccess(reply, {
        likes: updatedVideo?.likes ?? 0,
        dislikes: updatedVideo?.dislikes ?? 0,
      });
    } catch (error) {
      this.logger.error('VideosController.likeVideo failed', error);

      return await this.sendCaughtError(reply, error, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Dislike a video
   * POST /videos/:videoId/dislike
   *
   * Validates global and video-level dislike settings, plus Turnstile if enabled
   */
  dislikeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { cloudflareTurnstileToken } = (request.body ?? {}) as LikeDislikeBody;

      // Check global setting
      const config = getConfig();

      if (!config.nodeSettings.isDislikesEnabled) {
        throw new ForbiddenError('Disliking is currently disabled');
      }

      // Validate Turnstile if enabled
      await this.validateTurnstileIfEnabled(request, cloudflareTurnstileToken);

      // Check video exists and video-level setting
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError('Video not found');
      }

      if (!video.is_dislikes_enabled) {
        throw new ForbiddenError('Dislikes are currently disabled for this video');
      }

      // Increment dislike count
      await this.videosService.incrementDislikes(videoId);

      // Purge cache
      await this.cloudflareService.purgeWatchPages([videoId]);

      // Return updated counts
      const updatedVideo = await this.videosService.getVideo(videoId);
      return await this.sendSuccess(reply, {
        likes: updatedVideo?.likes ?? 0,
        dislikes: updatedVideo?.dislikes ?? 0,
      });
    } catch (error) {
      this.logger.error('VideosController.dislikeVideo failed', error);

      return await this.sendCaughtError(reply, error, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Report a video
   * POST /videos/:videoId/report
   *
   * Validates global and video-level report settings, plus Turnstile if enabled
   */
  reportVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { email, reportType, message, cloudflareTurnstileToken } = request.body as ReportBody;

      const config = getConfig();

      const nodeSettings = config.nodeSettings;

      // Check global reports enabled
      if (!nodeSettings.isReportsEnabled) {
        throw new BadRequestError('reporting is currently disabled');
      }

      // Check video exists and video-level reports enabled
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError('this video no longer exists');
      }
      if (!video.is_reports_enabled) {
        throw new BadRequestError('reporting is currently disabled for this video');
      }

      // Validate Cloudflare Turnstile token if enabled
      if (nodeSettings.isCloudflareTurnstileEnabled) {
        if (cloudflareTurnstileToken === undefined || cloudflareTurnstileToken === '') {
          throw new BadRequestError(
            'human verification was enabled on this MoarTube Node, please refresh your browser'
          );
        }
        const clientIp = (request.headers['cf-connecting-ip'] as string) || request.ip;
        const isValid = await this.cloudflareService.validateTurnstileToken(
          cloudflareTurnstileToken,
          clientIp
        );
        if (!isValid) {
          throw new BadRequestError('human verification failed, please try again');
        }
      }

      // Create the video report
      await this.reportsService.createVideoReport({
        videoId,
        videoTimestamp: video.creation_timestamp,
        email,
        type: reportType,
        message,
      });

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('VideosController.reportVideo failed', error);

      return await this.sendCaughtError(reply, error, 'error communicating with the MoarTube node');
    }
  };

  private commentCacheState = async (videoId: string): Promise<CommentCacheState> => ({
    epoch: await this.commentsService.getCacheEpoch(),
    version: await this.commentsService.getCacheVersion(videoId),
  });

  getCommentState = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      const { videoId } = request.params as VideoIdParams;
      const state = await this.commentCacheState(videoId);
      const totalCount = await this.commentsService.countCommentsForVideo(videoId);
      if (
        (request.query as { fresh?: string }).fresh !== '1' &&
        request.headers.authorization === undefined
      ) {
        reply.header('Cache-Control', COMMENT_STATE_CACHE_CONTROL);
      }
      return await this.sendSuccess(reply, { ...state, totalCount });
    } catch (error) {
      this.logger.error('Comment state failed', error);
      return await this.sendError(reply, 'Unable to load comment state', 500);
    }
  };

  /**
   * Get comments for a video
   * GET /videos/:videoId/comments
   */
  getComments = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const response = await readCachedComments(
        request,
        reply,
        () => this.commentCacheState(videoId),
        async () => {
          const { type, sort, timestamp, beforeId, afterId, includeTotal, knownIds } =
            request.query as VideoCommentsQuery;
          const cursorId = type === 'before' ? beforeId : afterId;
          const comments =
            cursorId !== undefined
              ? await this.commentsService.getCommentsForVideo(
                  videoId,
                  type,
                  sort,
                  timestamp,
                  cursorId
                )
              : await this.commentsService.getCommentsForVideo(videoId, type, sort, timestamp);

          const page = comments.slice(0, 100),
            known = new Set(knownIds?.split(',').map(Number));
          // Preserve logical page boundaries while omitting bodies the browser already holds.
          const formattedComments = await this.commentsService.formatComments(
            videoId,
            page.filter((comment) => !known.has(comment.comment_id))
          );

          return {
            comments: formattedComments,
            commentIds: knownIds === undefined ? undefined : page.map((c) => c.comment_id),
            pageEnd:
              knownIds === undefined
                ? undefined
                : page
                    .slice(-1)
                    .map((c) => ({ commentId: c.comment_id, timestamp: c.timestamp }))[0],
            hasMore: comments.length > 100,
            totalCount:
              includeTotal === '1'
                ? await this.commentsService.countCommentsForVideo(videoId)
                : undefined,
            timestamp: timestamp,
          };
        }
      );
      return await this.sendSuccess(reply, response);
    } catch (error) {
      this.logger.error('VideosController.getComments failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Add a comment to a video
   * POST /videos/:videoId/comment
   */
  addComment = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { commentPlainText, timestamp, cloudflareTurnstileToken } = request.body as CommentBody;

      const config = getConfig();

      const nodeSettings = config.nodeSettings;

      // Check global comments enabled
      if (!nodeSettings.isCommentsEnabled) {
        throw new BadRequestError('commenting is currently disabled');
      }

      // Check video exists and video-level comments enabled
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError(`Video not found`);
      }
      if (!video.is_comments_enabled) {
        throw new BadRequestError('commenting is currently disabled for this video');
      }

      // Validate Cloudflare Turnstile token if enabled
      if (nodeSettings.isCloudflareTurnstileEnabled) {
        if (cloudflareTurnstileToken === undefined || cloudflareTurnstileToken === '') {
          throw new BadRequestError(
            'human verification was enabled on this MoarTube Node, please refresh your browser'
          );
        }
        const clientIp = (request.headers['cf-connecting-ip'] as string) || request.ip;
        const isValid = await this.cloudflareService.validateTurnstileToken(
          cloudflareTurnstileToken,
          clientIp
        );
        if (!isValid) {
          throw new BadRequestError('human verification failed, please try again');
        }
      }

      // Validate comment text
      if (!commentPlainText || commentPlainText.trim() === '') {
        throw new BadRequestError('Comment text is required');
      }

      // Create the comment (service handles sanitization and incrementing video count)
      const comment = await this.commentsService.createComment({
        videoId,
        commentPlainText,
      });

      let comments = [comment];
      let totalCount: number | undefined;
      let refreshIncomplete = false;
      try {
        comments = await this.commentsService.getCommentsForVideo(
          videoId,
          'after',
          'ascending',
          timestamp
        );
        totalCount = await this.commentsService.countCommentsForVideo(videoId);
      } catch (error) {
        comments = [comment];
        refreshIncomplete = true;
        this.logger.warn('Comment saved; follow-up refresh unavailable', { error });
      }

      // Metadata is part of the batch, including comments first seen while posting.
      // A successful write remains successful if its follow-up metadata read fails.
      let formattedComments;
      try {
        formattedComments = await this.commentsService.formatComments(
          videoId,
          comments.slice(0, 100)
        );
      } catch (error) {
        refreshIncomplete = true;
        this.logger.warn('Comment saved; reply metadata unavailable', { error });
        formattedComments = comments.slice(0, 100).map((c) => ({
          commentId: c.comment_id,
          timestamp: c.timestamp,
          commentPlainTextSanitized: c.comment_plain_text_sanitized,
        }));
      }

      // Purge Cloudflare cache
      try {
        await this.cloudflareService.purgeWatchPages([videoId]);
      } catch (error) {
        this.logger.warn('Comment saved; cache invalidation unavailable', { error });
      }

      return await this.sendSuccess(reply, {
        commentId: comment.comment_id,
        comment: {
          commentId: comment.comment_id,
          timestamp: comment.timestamp,
          commentPlainTextSanitized: comment.comment_plain_text_sanitized,
        },
        totalCount,
        refreshIncomplete,
        comments: formattedComments,
      });
    } catch (error) {
      this.logger.error('VideosController.addComment failed', error);

      return await this.sendCaughtError(reply, error, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Delete a comment
   * POST /videos/:videoId/comments/:commentId/delete
   */
  deleteComment = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId, commentId } = request.params as VideoIdParams & { commentId: number };
      const { timestamp } = request.query as { timestamp: number };

      const deleted = await this.commentsService.deleteComment(videoId, commentId, timestamp);

      if (!deleted) {
        throw new NotFoundError(`Comment not found`);
      }

      // Purge Cloudflare cache for watch page
      await this.cloudflareService.purgeWatchPages([videoId]);

      return await this.sendSuccess(reply, { commentId });
    } catch (error) {
      this.logger.error('VideosController.deleteComment failed', error);

      return await this.sendCaughtError(reply, error, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Publish a video
   * POST /videos/:videoId/publish
   */
  publishVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.publishVideo(videoId);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.publishVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Unpublish a video
   * POST /videos/:videoId/unpublish
   */
  unpublishVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.videosService.unpublishVideo(videoId);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.unpublishVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get video watch data for media player
   * GET /videos/:videoId/watch
   */
  getWatchData = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const watchData = await this.videosService.getWatchData(videoId);

      if (watchData === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, { video: watchData });
    } catch (error) {
      this.logger.error('VideosController.getWatchData failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get video permissions
   * GET /videos/:videoId/permissions
   */
  getVideoPermissions = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const permissions = await this.videosService.getPermissions(videoId);

      if (permissions === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, permissions);
    } catch (error) {
      this.logger.error('VideosController.getVideoPermissions failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Update video permission
   * POST /videos/:videoId/permissions
   */
  updateVideoPermission = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { type, isEnabled } = request.body as { type: string; isEnabled: boolean };

      // Map permission type to update field
      const permissionFields: Record<string, keyof UpdateVideoInput> = {
        comments: 'isCommentsEnabled',
        likes: 'isLikesEnabled',
        dislikes: 'isDislikesEnabled',
        reports: 'isReportsEnabled',
        livechat: 'isLiveChatEnabled',
      };

      const field = permissionFields[type];

      if (!field) {
        throw new BadRequestError(`Invalid permission type: ${type}`);
      }

      await this.videosService.updateVideo(videoId, { [field]: isEnabled });

      return await this.sendSuccess(reply, { videoId, type, isEnabled });
    } catch (error) {
      this.logger.error('VideosController.updateVideoPermission failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get video data with formatted fields
   * GET /videos/:videoId/data
   */
  /**
   * Get video sources (adaptive and progressive)
   * GET /videos/:videoId/sources
   */
  getVideoSources = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const sources = await this.videosService.getVideoSources(videoId);

      if (sources === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, sources);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return this.sendError(reply, error.message, 404);
      }
      this.logger.error('VideosController.getVideoSources failed', error);
      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get detailed video data
   * GET /videos/:videoId/data
   */
  getVideoData = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const videoData = await this.videosService.getVideoData(videoId);

      if (videoData === null) {
        throw new NotFoundError(`Video not found`);
      }

      return await this.sendSuccess(reply, { videoData });
    } catch (error) {
      this.logger.error('VideosController.getVideoData failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get all videos data with formatted fields
   * GET /videos/data/all
   */
  getAllVideosData = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const videosData = await this.videosService.getAllVideosData(pageOptions(request.query));

      return await this.sendSuccess(reply, {
        videosData: videosData.slice(0, 100),
        hasMore: videosData.length > 100,
      });
    } catch (error) {
      this.logger.error('VideosController.getAllVideosData failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get single comment by ID
   * GET /videos/:videoId/comments/:commentId
   */
  getComment = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId, commentId } = request.params as VideoIdParams & { commentId: number };

      const response = await readCachedComments(
        request,
        reply,
        () => this.commentCacheState(videoId),
        async () => {
          const comment = await this.commentsService.getComment(videoId, commentId);

          if (comment === null) {
            return null;
          }

          const backlinks = await this.commentsService.getCommentBacklinks(videoId, commentId);
          return {
            comment: {
              replyIds: backlinks.replyIds,
              hasMoreReplies: backlinks.hasMore,
              commentId: comment.comment_id,
              timestamp: comment.timestamp,
              commentPlainTextSanitized: comment.comment_plain_text_sanitized,
            },
          };
        }
      );
      if (response === null) {
        return await this.sendError(reply, 'Comment not found', 404);
      }
      return await this.sendSuccess(reply, response);
    } catch (error) {
      this.logger.error('VideosController.getComment failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  getCommentCacheChanges = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { since, epoch } = request.query as { since: number; epoch?: string };
      const response = await readCachedComments(
        request,
        reply,
        () => this.commentCacheState(videoId),
        async () => ({
          ...(await this.commentsService.getCacheChanges(videoId, since, epoch)),
          totalCount: await this.commentsService.countCommentsForVideo(videoId),
        })
      );
      return await this.sendSuccess(reply, response);
    } catch (error) {
      this.logger.error('Comment synchronization failed', error);
      return await this.sendError(reply, 'Unable to synchronize comments', 500);
    }
  };

  getCommentBacklinks = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId, commentId } = request.params as VideoIdParams & { commentId: number };
      const { beforeReplyId } = request.query as { beforeReplyId?: number };
      const response = await readCachedComments(
        request,
        reply,
        () => this.commentCacheState(videoId),
        async () => {
          if ((await this.commentsService.getComment(videoId, commentId)) === null) {
            return null;
          }
          return this.commentsService.getCommentBacklinks(videoId, commentId, beforeReplyId);
        }
      );
      if (response === null) {
        return await this.sendError(reply, 'Comment not found', 404);
      }
      return await this.sendSuccess(reply, response);
    } catch (error) {
      this.logger.error('Comment backlinks failed', error);
      return await this.sendError(reply, 'Unable to load replies', 500);
    }
  };

  /**
   * Get recommended videos
   * GET /videos/recommended
   */
  getRecommended = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const recommendedVideos = await this.videosService.getRecommendedVideos(
        pageOptions(request.query)
      );

      return await this.sendSuccess(reply, {
        recommendedVideos: recommendedVideos.slice(0, 100),
        hasMore: recommendedVideos.length > 100,
      });
    } catch (error) {
      this.logger.error('VideosController.getRecommended failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get tags from published/live videos
   * GET /videos/tags
   */
  getTags = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const tags = await this.videosService.getPublishedTags();

      return await this.sendSuccess(reply, { tags });
    } catch (error) {
      this.logger.error('VideosController.getTags failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Get tags from all videos
   * GET /videos/tags/all
   */
  getAllTags = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const tags = await this.videosService.getAllTags();

      return await this.sendSuccess(reply, { tags });
    } catch (error) {
      this.logger.error('VideosController.getAllTags failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Batch delete videos
   * POST /videos/delete
   */
  batchDelete = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoIds } = request.body as { videoIds: string[] };

      const result = await this.videosService.deleteVideos(videoIds);

      return await this.sendSuccess(reply, {
        deletedVideoIds: result.deletedVideoIds,
        nonDeletedVideoIds: result.nonDeletedVideoIds,
      });
    } catch (error) {
      this.logger.error('VideosController.batchDelete failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Batch finalize videos
   * POST /videos/finalize
   */
  batchFinalize = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoIds } = request.body as { videoIds: string[] };

      const result = await this.videosService.finalizeVideos(videoIds);

      return await this.sendSuccess(reply, {
        finalizedVideoIds: result.finalizedVideoIds,
        nonFinalizedVideoIds: result.nonFinalizedVideoIds,
      });
    } catch (error) {
      this.logger.error('VideosController.batchFinalize failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Update video length
   * POST /videos/:videoId/lengths
   */
  setVideoLengths = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { lengthSeconds, lengthTimestamp } = request.body as {
        lengthSeconds: number;
        lengthTimestamp: string;
      };

      await this.videosService.setVideoLength(videoId, lengthSeconds, lengthTimestamp);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.setVideoLengths failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Write HLS master manifest
   * POST /videos/:videoId/adaptive/m3u8/:manifestType/manifests/masterManifest
   */
  writeMasterManifest = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId, manifestType } = request.params as VideoAdaptiveManifestParams;
      const { masterManifest } = request.body as VideoMasterManifestBody;

      const video = await this.videosService.getVideo(videoId);

      if (video === null) {
        throw new NotFoundError(`Video not found`);
      }

      await this.videosService.writeMasterManifest(videoId, manifestType, masterManifest);

      return await this.sendSuccess(reply, { videoId });
    } catch (error) {
      this.logger.error('VideosController.writeMasterManifest failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Upload video files (HLS segments, MP4, WebM, OGV)
   * POST /videos/:videoId/upload
   */
  uploadVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.query as UploadQueryParams;

      // Validate parameters
      if (!this.videoUploadService.validateVideoUploadParams(format, resolution)) {
        await this.videosService.setError(videoId, true);

        throw new BadRequestError('Invalid format or resolution');
      }

      // Validate video exists
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError(`Video not found`);
      }

      // Track upload progress
      this.videoUploadService.trackProgress(request, videoId, format, resolution);

      try {
        // Process multipart upload
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === 'file') {
            const file = part;

            // Validate mime type
            if (!this.videoUploadService.isValidVideoMimeType(file.mimetype)) {
              throw new BadRequestError(`Unsupported file type: ${file.mimetype}`);
            }

            // Get destination path
            const destPath = this.videoUploadService.getVideoDestinationPath(
              videoId,
              format,
              resolution,
              file.filename
            );

            if (destPath === null || destPath === '') {
              throw new BadRequestError(`Invalid filename: ${file.filename}`);
            }

            // Save file
            await this.videoUploadService.saveUploadedFile(file, destPath);
          }
        }

        if ((request.query as { finalBatch?: string }).finalBatch === 'false') {
          return await this.sendSuccess(reply, { success: true, videoId, format, resolution });
        }
        // Handle upload completion
        const result = await this.videoUploadService.handleVideoUploadComplete({
          videoId,
          format,
          resolution,
        });

        return await this.sendSuccess(reply, result);
      } catch (error) {
        this.logger.error('Video upload error', error, { videoId });

        this.videoUploadService.handleUploadError(videoId);

        await this.videosService.setError(videoId, true);

        throw error;
      }
    } catch (error) {
      this.logger.error('VideosController.uploadVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Upload stream files (HLS segments during live stream)
   * POST /videos/:videoId/stream
   */
  uploadStream = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { format, resolution } = request.query as UploadQueryParams;

      // Validate parameters
      if (!this.videoUploadService.validateVideoUploadParams(format, resolution)) {
        await this.videosService.setError(videoId, true);

        throw new BadRequestError('Invalid format or resolution');
      }

      // Validate video exists
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        throw new NotFoundError(`Video not found`);
      }

      try {
        // Process multipart upload
        const parts = request.parts();

        for await (const part of parts) {
          if (part.type === 'file') {
            const file = part;

            // Validate mime type (only m3u8 and ts for streams)
            if (!this.videoUploadService.isValidStreamMimeType(file.mimetype)) {
              throw new BadRequestError(`Unsupported stream file type: ${file.mimetype}`);
            }

            // Get destination path
            const destPath = this.videoUploadService.getStreamDestinationPath(
              videoId,
              format,
              resolution,
              file.filename
            );

            if (destPath === null || destPath === '') {
              throw new BadRequestError(`Invalid filename: ${file.filename}`);
            }

            // Save file
            await this.videoUploadService.saveUploadedFile(file, destPath);
          }
        }

        // Handle stream upload completion
        const result = this.videoUploadService.handleStreamUploadComplete({
          videoId,
          format,
          resolution,
        });

        return await this.sendSuccess(reply, result);
      } catch (error) {
        await this.videosService.setError(videoId, true);

        throw error;
      }
    } catch (error) {
      this.logger.error('VideosController.uploadStream failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Upload thumbnail image
   * POST /videos/:videoId/images/thumbnail
   */
  uploadThumbnail = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await this.handleImageUpload(request, reply, 'thumbnail', 'thumbnailFile');
    } catch (error) {
      this.logger.error('VideosController.uploadThumbnail failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Upload preview image
   * POST /videos/:videoId/images/preview
   */
  uploadPreview = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await this.handleImageUpload(request, reply, 'preview', 'previewFile');
    } catch (error) {
      this.logger.error('VideosController.uploadPreview failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Upload poster image
   * POST /videos/:videoId/images/poster
   */
  uploadPoster = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await this.handleImageUpload(request, reply, 'poster', 'posterFile');
    } catch (error) {
      this.logger.error('VideosController.uploadPoster failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Validate Cloudflare Turnstile token if enabled
   */
  private async validateTurnstileIfEnabled(request: FastifyRequest, token?: string): Promise<void> {
    const config = getConfig();

    const nodeSettings = config.nodeSettings;

    if (!nodeSettings.isCloudflareTurnstileEnabled) {
      return; // Turnstile not enabled, validation passes
    }

    if (token === undefined || token.length === 0) {
      throw new ForbiddenError(
        'Human verification is enabled on this MoarTube Node, please refresh your browser'
      );
    }

    const clientIp = request.ip || '';

    const isValid = await this.cloudflareService.validateTurnstileToken(token, clientIp);

    if (!isValid) {
      throw new ForbiddenError('Human verification failed');
    }
  }

  /**
   * Handle image upload (shared logic for thumbnail, preview, poster)
   */
  private readonly handleImageUpload = async (
    request: FastifyRequest,
    reply: FastifyReply,
    imageType: ImageType,
    fieldName: string
  ): Promise<FastifyReply> => {
    const { videoId } = request.params as VideoIdParams;

    // Validate video exists
    const video = await this.videosService.getVideo(videoId);

    if (!video) {
      throw new NotFoundError(`Video not found`);
    }

    // Process multipart upload
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === fieldName) {
        const file = part;

        // Validate mime type
        if (!this.videoUploadService.isValidImageMimeType(file.mimetype)) {
          throw new BadRequestError(
            `Unsupported image type: ${file.mimetype}. Only JPEG is supported.`
          );
        }

        // Get destination path
        const destPath = this.videoUploadService.getImageDestinationPath(videoId, imageType);

        // Ensure directory exists
        fs.mkdirSync(destPath, { recursive: true });

        // Save with correct filename
        const fileName = `${imageType}.jpg`;
        const filePath = path.join(destPath, fileName);
        await writeUpload(file, filePath, 20 * 1024 ** 2);
      }
    }

    // Handle upload completion
    const result = await this.videoUploadService.handleImageUploadComplete({
      videoId,
      imageType,
    });

    return await this.sendSuccess(reply, result);
  };
}
