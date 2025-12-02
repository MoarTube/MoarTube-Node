/**
 * Videos Controller
 *
 * Handles HTTP requests for video-related operations.
 * Migrated from Express to Fastify with proper TypeScript types.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base';
import type {
  IVideoService,
  ICommentService,
  ICloudflareService,
  IReportService,
  UpdateVideoInput,
  ReportType,
} from '../services/interfaces';
import type { IVideoUploadService } from '../services';
import { NotFoundError, BadRequestError, ForbiddenError } from '../errors';
import { resolve } from '../core/container';
import { getConfig } from '../config';

/**
 * Request body/query/params type definitions
 */
interface VideoIdParams {
  videoId: string;
}

interface VideoSearchQuery {
  searchTerm?: string;
  sortTerm?: 'latest' | 'popular' | 'oldest';
  tagTerm?: string;
  tagLimit?: number;
  timestamp?: number;
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
  timestamp?: number;
  type?: string;
}

interface CommentBody {
  commentPlainText: string;
  timestamp?: number;
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
  constructor() {
    super('VideosController');
  }

  /**
   * Get video service from DI container
   */
  private getVideoService(): IVideoService {
    return resolve('videoService');
  }

  /**
   * Get comment service from DI container
   */
  private getCommentService(): ICommentService {
    return resolve('commentService');
  }

  /**
   * Get video upload service from DI container
   */
  private getVideoUploadService(): IVideoUploadService {
    return resolve('videoUploadService');
  }

  // Reserved for future upload tracking - uncomment when needed
  // private getUploadTrackerService(): IUploadTrackerService {
  //   return resolve('uploadTrackerService');
  // }

  /**
   * Get Cloudflare service from DI container
   */
  private getCloudflareService(): ICloudflareService {
    return resolve('cloudflareService');
  }

  /**
   * Get report service from DI container
   */
  private getReportService(): IReportService {
    return resolve('reportService');
  }

  /**
   * Validate Cloudflare Turnstile token if enabled
   */
  private async validateTurnstileIfEnabled(request: FastifyRequest, token?: string): Promise<void> {
    const config = getConfig();
    const nodeSettings = config.nodeSettings;

    if (!nodeSettings.isCloudflareTurnstileEnabled) {
      return; // Turnstile not enabled, validation passes
    }

    if (!token || token.length === 0) {
      throw new ForbiddenError(
        'Human verification is enabled on this MoarTube Node, please refresh your browser'
      );
    }

    const cloudflareService = this.getCloudflareService();
    const clientIp = request.ip || '';

    const isValid = await cloudflareService.validateTurnstileToken(token, clientIp);
    if (!isValid) {
      throw new ForbiddenError('Human verification failed');
    }
  }

  /**
   * Import a new video
   * POST /videos/import
   */
  importVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { title, description, tags } = request.body as VideoImportBody;

    const result = await videoService.createVideo({ title, description, tags });

    this.sendSuccess(reply, result, 'Video imported successfully');
  };

  /**
   * Mark video as imported (import complete)
   * POST /videos/imported
   *
   * Takes videoId from request body (legacy route)
   */
  videoImportedFromBody = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.body as { videoId: string };

    if (!videoId) {
      throw new BadRequestError('videoId is required');
    }

    await videoService.setImported(videoId);

    this.sendSuccess(reply, {});
  };

  /**
   * Start publishing process
   * POST /videos/publishing
   *
   * Takes videoId from request body (legacy route)
   */
  startPublishingFromBody = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.body as { videoId: string };

    if (!videoId) {
      throw new BadRequestError('videoId is required');
    }

    await videoService.setPublishing(videoId, true);

    this.sendSuccess(reply, {});
  };

  /**
   * Mark video as published (publishing complete)
   * POST /videos/published
   *
   * Takes videoId from request body (legacy route)
   */
  videoPublishedFromBody = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.body as { videoId: string };

    if (!videoId) {
      throw new BadRequestError('videoId is required');
    }

    await videoService.setPublishing(videoId, false);
    await videoService.publishVideo(videoId);

    this.sendSuccess(reply, {});
  };

  /**
   * Mark video as imported (import complete)
   * POST /videos/:videoId/imported
   */
  videoImported = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setImported(videoId);

    this.sendSuccess(reply, { videoId }, 'Video import completed');
  };

  /**
   * Stop video import process
   * POST /videos/:videoId/importing/stop
   */
  stopImporting = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setImporting(videoId, false);

    this.sendSuccess(reply, { videoId }, 'Video import stopped');
  };

  /**
   * Mark video as publishing (start publishing)
   * POST /videos/:videoId/publishing
   */
  startPublishing = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setPublishing(videoId, true);

    this.sendSuccess(reply, { videoId }, 'Video publishing started');
  };

  /**
   * Mark video as published (publishing complete)
   * POST /videos/:videoId/published
   */
  videoPublished = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setPublishing(videoId, false);
    await videoService.publishVideo(videoId);

    this.sendSuccess(reply, { videoId }, 'Video publishing completed');
  };

  /**
   * Mark specific format/resolution as published
   * POST /videos/:videoId/format-resolution/published
   */
  formatResolutionPublished = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.body as FormatResolutionBody;

    if (!format || !resolution) {
      throw new BadRequestError('Format and resolution are required');
    }

    await videoService.markFormatResolutionPublished(videoId, format, resolution);

    this.sendSuccess(reply, { videoId, format, resolution }, 'Format/resolution published');
  };

  /**
   * Stop video publishing process
   * POST /videos/:videoId/publishing/stop
   */
  stopPublishing = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setPublishing(videoId, false);

    this.sendSuccess(reply, { videoId }, 'Video publishing stopped');
  };

  /**
   * Notify video upload complete
   * POST /videos/:videoId/upload
   */
  videoUploaded = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.body as FormatResolutionBody;

    if (!format || !resolution) {
      throw new BadRequestError('Format and resolution are required');
    }

    await videoService.notifyUploadComplete(videoId, format, resolution);

    this.sendSuccess(reply, { videoId }, 'Video upload notification processed');
  };

  /**
   * Notify video stream complete
   * POST /videos/:videoId/stream
   */
  videoStreamed = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.body as FormatResolutionBody;

    if (!format || !resolution) {
      throw new BadRequestError('Format and resolution are required');
    }

    await videoService.notifyStreamComplete(videoId, format, resolution);

    this.sendSuccess(reply, { videoId }, 'Video stream notification processed');
  };

  /**
   * Mark video as error state
   * POST /videos/:videoId/error
   */
  videoError = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.setError(videoId, true);

    this.sendSuccess(reply, { videoId }, 'Video marked as error');
  };

  /**
   * Mark video as error state (videoId from body)
   * POST /videos/error
   *
   * This is the legacy route that takes videoId from request body
   */
  setErrorFromBody = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.body as { videoId: string };

    if (!videoId) {
      throw new BadRequestError('videoId is required');
    }

    await videoService.setError(videoId, true);

    this.sendSuccess(reply, {});
  };

  /**
   * Set video source file extension
   * POST /videos/:videoId/source-file-extension
   */
  setSourceFileExtension = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { sourceFileExtension } = request.body as SourceFileExtensionBody;

    if (!sourceFileExtension) {
      throw new BadRequestError('Source file extension is required');
    }

    await videoService.setSourceFileExtension(videoId, sourceFileExtension);

    this.sendSuccess(reply, { videoId, sourceFileExtension }, 'Source file extension set');
  };

  /**
   * Get video source file extension
   * GET /videos/:videoId/source-file-extension
   */
  getSourceFileExtension = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const sourceFileExtension = await videoService.getSourceFileExtension(videoId);

    if (sourceFileExtension === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { sourceFileExtension });
  };

  /**
   * Get video publish status for all formats/resolutions
   * GET /videos/:videoId/publishes
   */
  getPublishes = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const publishes = await videoService.getPublishes(videoId);

    if (publishes === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { publishes });
  };

  /**
   * Unpublish specific format/resolution
   * POST /videos/:videoId/unpublish
   */
  unpublishFormatResolution = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.body as FormatResolutionBody;

    if (!format || !resolution) {
      throw new BadRequestError('Format and resolution are required');
    }

    await videoService.unpublishFormatResolution(videoId, format, resolution);

    this.sendSuccess(reply, { videoId, format, resolution }, 'Format/resolution unpublished');
  };

  /**
   * Get a single video by ID
   * GET /videos/:videoId
   */
  getVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const video = await videoService.getVideo(videoId);

    if (video === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, video);
  };

  /**
   * Search/list videos
   * GET /videos/search
   */
  searchVideos = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
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
    const searchValue = searchTerm ?? tagTerm;
    const options = {
      sortBy,
      sortDirection,
      limit: tagLimit ?? 20,
      ...(searchValue !== undefined ? { search: searchValue } : {}),
    };

    const result = await videoService.getVideos(options);

    this.sendSuccess(reply, {
      videos: result.data,
      timestamp: timestamp ?? Date.now(),
    });
  };

  /**
   * Update video metadata
   * POST /videos/:videoId/data
   */
  updateVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { title, description, tags } = request.body as VideoUpdateBody;

    // Build update data, only include defined properties
    const updateData = {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(tags !== undefined ? { tags } : {}),
    };

    const video = await videoService.updateVideo(videoId, updateData);

    if (video === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { video }, 'Video updated successfully');
  };

  /**
   * Delete a video
   * POST /videos/:videoId/delete
   */
  deleteVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const deleted = await videoService.deleteVideo(videoId);

    if (!deleted) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { videoId }, 'Video deleted successfully');
  };

  /**
   * Finalize video after upload
   * POST /videos/:videoId/finalize
   */
  finalizeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.finalizeVideo(videoId);

    this.sendSuccess(reply, { videoId }, 'Video finalized successfully');
  };

  /**
   * Increment view count with debouncing
   * POST /videos/:videoId/view
   *
   * Uses debounced counter to batch DB writes for performance
   */
  incrementViews = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    // Get current view count including pending
    const result = await videoService.incrementViewsDebounced(videoId);

    this.sendSuccess(reply, { views: result.views });
  };

  /**
   * Like a video
   * POST /videos/:videoId/like
   *
   * Validates global and video-level like settings, plus Turnstile if enabled
   */
  likeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const cloudflareService = this.getCloudflareService();
    const { videoId } = request.params as VideoIdParams;
    const { cloudflareTurnstileToken } = (request.body as LikeDislikeBody) || {};

    // Check global setting
    const config = getConfig();
    if (!config.nodeSettings.isLikesEnabled) {
      throw new ForbiddenError('Liking is currently disabled');
    }

    // Validate Turnstile if enabled
    await this.validateTurnstileIfEnabled(request, cloudflareTurnstileToken);

    // Check video exists and video-level setting
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError('Video not found');
    }

    if (!video.isLikesEnabled) {
      throw new ForbiddenError('Likes are currently disabled for this video');
    }

    // Increment like count
    await videoService.incrementLikes(videoId);

    // Purge cache
    await cloudflareService.purgeWatchPages([videoId]);

    // Return updated counts
    const updatedVideo = await videoService.getVideo(videoId);
    this.sendSuccess(reply, {
      likes: updatedVideo?.likes ?? 0,
      dislikes: updatedVideo?.dislikes ?? 0,
    });
  };

  /**
   * Dislike a video
   * POST /videos/:videoId/dislike
   *
   * Validates global and video-level dislike settings, plus Turnstile if enabled
   */
  dislikeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const cloudflareService = this.getCloudflareService();
    const { videoId } = request.params as VideoIdParams;
    const { cloudflareTurnstileToken } = (request.body as LikeDislikeBody) || {};

    // Check global setting
    const config = getConfig();
    if (!config.nodeSettings.isDislikesEnabled) {
      throw new ForbiddenError('Disliking is currently disabled');
    }

    // Validate Turnstile if enabled
    await this.validateTurnstileIfEnabled(request, cloudflareTurnstileToken);

    // Check video exists and video-level setting
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError('Video not found');
    }

    if (!video.isDislikesEnabled) {
      throw new ForbiddenError('Dislikes are currently disabled for this video');
    }

    // Increment dislike count
    await videoService.incrementDislikes(videoId);

    // Purge cache
    await cloudflareService.purgeWatchPages([videoId]);

    // Return updated counts
    const updatedVideo = await videoService.getVideo(videoId);
    this.sendSuccess(reply, {
      likes: updatedVideo?.likes ?? 0,
      dislikes: updatedVideo?.dislikes ?? 0,
    });
  };

  /**
   * Report a video
   * POST /videos/:videoId/report
   *
   * Validates global and video-level report settings, plus Turnstile if enabled
   */
  reportVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const reportService = this.getReportService();
    const { videoId } = request.params as VideoIdParams;
    const { email, reportType, message, cloudflareTurnstileToken } = request.body as ReportBody;

    const config = getConfig();
    const nodeSettings = config.nodeSettings;

    // Check global reports enabled
    if (!nodeSettings.isReportsEnabled) {
      throw new BadRequestError('reporting is currently disabled');
    }

    // Check video exists and video-level reports enabled
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError('this video no longer exists');
    }
    if (!video.isReportsEnabled) {
      throw new BadRequestError('reporting is currently disabled for this video');
    }

    // Validate Cloudflare Turnstile token if enabled
    if (nodeSettings.isCloudflareTurnstileEnabled) {
      if (!cloudflareTurnstileToken) {
        throw new BadRequestError(
          'human verification was enabled on this MoarTube Node, please refresh your browser'
        );
      }
      const cloudflareService = this.getCloudflareService();
      const clientIp = (request.headers['cf-connecting-ip'] as string) || request.ip;
      const isValid = await cloudflareService.validateTurnstileToken(
        cloudflareTurnstileToken,
        clientIp
      );
      if (!isValid) {
        throw new BadRequestError('human verification failed, please try again');
      }
    }

    // Validate required fields
    if (!email || !reportType || !message) {
      throw new BadRequestError('email, reportType, and message are required');
    }

    // Create the video report
    await reportService.createVideoReport({
      videoId,
      videoTimestamp: video.creationTimestamp,
      email,
      type: reportType,
      message,
    });

    this.sendSuccess(reply, {}, 'Report submitted successfully');
  };

  /**
   * Get comments for a video
   * GET /videos/:videoId/comments
   */
  getComments = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const commentService = this.getCommentService();
    const { videoId } = request.params as VideoIdParams;
    const { timestamp } = request.query as VideoCommentsQuery;

    const comments = await commentService.getCommentsForVideo(videoId, {
      limit: 50,
    });

    // Map comments to expected format
    const formattedComments = comments.map((comment) => ({
      commentId: comment.id,
      timestamp: comment.timestamp,
      commentPlainTextSanitized: comment.commentPlainTextSanitized,
    }));

    this.sendSuccess(reply, {
      comments: formattedComments,
      timestamp: timestamp ?? Date.now(),
    });
  };

  /**
   * Add a comment to a video
   * POST /videos/:videoId/comment
   */
  addComment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const commentService = this.getCommentService();
    const cloudflareService = this.getCloudflareService();
    const { videoId } = request.params as VideoIdParams;
    const { commentPlainText, cloudflareTurnstileToken } = request.body as CommentBody;

    const config = getConfig();
    const nodeSettings = config.nodeSettings;

    // Check global comments enabled
    if (!nodeSettings.isCommentsEnabled) {
      throw new BadRequestError('commenting is currently disabled');
    }

    // Check video exists and video-level comments enabled
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }
    if (!video.isCommentsEnabled) {
      throw new BadRequestError('commenting is currently disabled for this video');
    }

    // Validate Cloudflare Turnstile token if enabled
    if (nodeSettings.isCloudflareTurnstileEnabled) {
      if (!cloudflareTurnstileToken) {
        throw new BadRequestError(
          'human verification was enabled on this MoarTube Node, please refresh your browser'
        );
      }
      const clientIp = (request.headers['cf-connecting-ip'] as string) || request.ip;
      const isValid = await cloudflareService.validateTurnstileToken(
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
    const comment = await commentService.createComment({
      videoId,
      commentText: commentPlainText,
    });

    // Get all comments (limited to recent ones for response)
    const comments = await commentService.getCommentsForVideo(videoId, {
      limit: 100,
    });

    // Format comments for response (matching JS format)
    const formattedComments = comments.map((c) => ({
      id: c.id,
      video_id: videoId,
      comment_plain_text_sanitized: c.commentPlainTextSanitized,
      timestamp: c.timestamp,
    }));

    // Purge Cloudflare cache
    await cloudflareService.purgeWatchPages([videoId]);

    this.sendSuccess(reply, {
      commentId: comment.id,
      comments: formattedComments,
    });
  };

  /**
   * Delete a comment
   * POST /videos/:videoId/comments/:commentId/delete
   */
  deleteComment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const commentService = this.getCommentService();
    const cloudflareService = this.getCloudflareService();
    const { videoId, commentId } = request.params as VideoIdParams & { commentId: string };

    const commentIdNum = Number.parseInt(commentId, 10);
    if (Number.isNaN(commentIdNum)) {
      throw new BadRequestError('Invalid comment ID');
    }

    const deleted = await commentService.deleteComment(commentIdNum);

    if (!deleted) {
      throw new NotFoundError(`Comment not found: ${commentId}`);
    }

    // Purge Cloudflare cache for watch page
    await cloudflareService.purgeWatchPages([videoId]);

    this.sendSuccess(reply, { commentId }, 'Comment deleted successfully');
  };

  /**
   * Publish a video
   * POST /videos/:videoId/publish
   */
  publishVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.publishVideo(videoId);

    this.sendSuccess(reply, { videoId }, 'Video published successfully');
  };

  /**
   * Unpublish a video
   * POST /videos/:videoId/unpublish
   */
  unpublishVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.unpublishVideo(videoId);

    this.sendSuccess(reply, { videoId }, 'Video unpublished successfully');
  };

  /**
   * Get video watch data for media player
   * GET /videos/:videoId/watch
   */
  getWatchData = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const watchData = await videoService.getWatchData(videoId);

    if (watchData === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { video: watchData });
  };

  /**
   * Get video permissions
   * GET /videos/:videoId/permissions
   */
  getVideoPermissions = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const permissions = await videoService.getPermissions(videoId);

    if (permissions === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, permissions);
  };

  /**
   * Update video permission
   * POST /videos/:videoId/permissions
   */
  updateVideoPermission = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { type, isEnabled } = request.body as { type: string; isEnabled: boolean };

    if (!type || typeof isEnabled !== 'boolean') {
      throw new BadRequestError('type and isEnabled are required');
    }

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

    await videoService.updateVideo(videoId, { [field]: isEnabled });

    this.sendSuccess(reply, { videoId, type, isEnabled }, 'Permission updated successfully');
  };

  /**
   * Get video data with formatted fields
   * GET /videos/:videoId/data
   */
  getVideoData = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const videoData = await videoService.getVideoData(videoId);

    if (videoData === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    this.sendSuccess(reply, { videoData });
  };

  /**
   * Get all videos data with formatted fields
   * GET /videos/data/all
   */
  getAllVideosData = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();

    const videosData = await videoService.getAllVideosData();

    this.sendSuccess(reply, { videosData });
  };

  /**
   * Get single comment by ID
   * GET /videos/:videoId/comments/:commentId
   */
  getComment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const commentService = this.getCommentService();
    const { videoId, commentId } = request.params as VideoIdParams & { commentId: string };

    const commentIdNum = Number.parseInt(commentId, 10);
    if (Number.isNaN(commentIdNum)) {
      throw new BadRequestError('Invalid comment ID');
    }

    const comment = await commentService.getComment(commentIdNum);

    if (comment === null) {
      throw new NotFoundError(`Comment not found: ${commentId}`);
    }

    // Verify comment belongs to video
    if (comment.videoId !== videoId) {
      throw new NotFoundError(`Comment not found for video: ${videoId}`);
    }

    this.sendSuccess(reply, { comment });
  };

  /**
   * Get recommended videos
   * GET /videos/recommended
   */
  getRecommended = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();

    const recommendedVideos = await videoService.getRecommendedVideos();

    this.sendSuccess(reply, { recommendedVideos });
  };

  /**
   * Get tags from published/live videos
   * GET /videos/tags
   */
  getTags = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();

    const tags = await videoService.getPublishedTags();

    this.sendSuccess(reply, { tags });
  };

  /**
   * Get tags from all videos
   * GET /videos/tags/all
   */
  getAllTags = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();

    const tags = await videoService.getAllTags();

    this.sendSuccess(reply, { tags });
  };

  /**
   * Get video alias URL
   * GET /videos/:videoId/alias
   */
  getAlias = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const video = await videoService.getVideo(videoId);
    if (video === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    if (!video.isIndexed) {
      throw new BadRequestError('Video is not indexed');
    }

    const videoAliasUrl = await videoService.getAliasUrl(videoId);

    this.sendSuccess(reply, { videoAliasUrl });
  };

  /**
   * Batch delete videos
   * POST /videos/delete
   */
  batchDelete = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoIds } = request.body as { videoIds: string[] };

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      throw new BadRequestError('videoIds array is required');
    }

    const result = await videoService.deleteVideos(videoIds);

    this.sendSuccess(reply, {
      deletedVideoIds: result.deletedVideoIds,
      nonDeletedVideoIds: result.nonDeletedVideoIds,
    });
  };

  /**
   * Batch finalize videos
   * POST /videos/finalize
   */
  batchFinalize = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoIds } = request.body as { videoIds: string[] };

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      throw new BadRequestError('videoIds array is required');
    }

    const result = await videoService.finalizeVideos(videoIds);

    this.sendSuccess(reply, {
      finalizedVideoIds: result.finalizedVideoIds,
      nonFinalizedVideoIds: result.nonFinalizedVideoIds,
    });
  };

  /**
   * Update video length
   * POST /videos/:videoId/lengths
   */
  setVideoLengths = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { lengthSeconds, lengthTimestamp } = request.body as {
      lengthSeconds: number;
      lengthTimestamp: string;
    };

    if (typeof lengthSeconds !== 'number' || typeof lengthTimestamp !== 'string') {
      throw new BadRequestError('lengthSeconds and lengthTimestamp are required');
    }

    await videoService.setVideoLength(videoId, lengthSeconds, lengthTimestamp);

    this.sendSuccess(reply, { videoId }, 'Video length updated successfully');
  };

  /**
   * Mark video index as outdated
   * POST /videos/:videoId/index/outdated
   */
  markIndexOutdated = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    const video = await videoService.getVideo(videoId);
    if (video === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    await videoService.markIndexOutdated(videoId);

    this.sendSuccess(reply, { videoId }, 'Video index marked as outdated');
  };

  /**
   * Write HLS master manifest
   * POST /videos/:videoId/adaptive/m3u8/:manifestType/manifests/masterManifest
   */
  writeMasterManifest = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId, manifestType } = request.params as VideoIdParams & { manifestType: string };
    const { manifest } = request.body as { manifest: string };

    if (manifestType !== 'video' && manifestType !== 'audio') {
      throw new BadRequestError('manifestType must be "video" or "audio"');
    }

    if (typeof manifest !== 'string' || manifest.length === 0) {
      throw new BadRequestError('manifest content is required');
    }

    const video = await videoService.getVideo(videoId);
    if (video === null) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    await videoService.writeMasterManifest(videoId, manifestType, manifest);

    this.sendSuccess(reply, { videoId }, 'Master manifest written successfully');
  };

  /**
   * Upload video files (HLS segments, MP4, WebM, OGV)
   * POST /videos/:videoId/upload
   */
  uploadVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const uploadService = this.getVideoUploadService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.query as UploadQueryParams;

    // Validate parameters
    if (!uploadService.validateVideoUploadParams(format, resolution)) {
      await videoService.setError(videoId, true);
      throw new BadRequestError('Invalid format or resolution');
    }

    // Validate video exists
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    // Track upload progress
    uploadService.trackProgress(request, videoId, format, resolution);

    try {
      // Process multipart upload
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'file') {
          const file = part;

          // Validate mime type
          if (!uploadService.isValidVideoMimeType(file.mimetype)) {
            throw new BadRequestError(`Unsupported file type: ${file.mimetype}`);
          }

          // Get destination path
          const destPath = uploadService.getVideoDestinationPath(
            videoId,
            format,
            resolution,
            file.filename
          );

          if (!destPath) {
            throw new BadRequestError(`Invalid filename: ${file.filename}`);
          }

          // Save file
          await uploadService.saveUploadedFile(file, destPath);
        }
      }

      // Handle upload completion
      const result = await uploadService.handleVideoUploadComplete({
        videoId,
        format,
        resolution,
      });

      this.sendSuccess(reply, result);
    } catch (error) {
      uploadService.handleUploadError(videoId, error as Error);
      await videoService.setError(videoId, true);
      throw error;
    }
  };

  /**
   * Upload stream files (HLS segments during live stream)
   * POST /videos/:videoId/stream
   */
  uploadStream = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const uploadService = this.getVideoUploadService();
    const { videoId } = request.params as VideoIdParams;
    const { format, resolution } = request.query as UploadQueryParams;

    // Validate parameters
    if (!uploadService.validateVideoUploadParams(format, resolution)) {
      await videoService.setError(videoId, true);
      throw new BadRequestError('Invalid format or resolution');
    }

    // Validate video exists
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    try {
      // Process multipart upload
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'file') {
          const file = part;

          // Validate mime type (only m3u8 and ts for streams)
          if (!uploadService.isValidStreamMimeType(file.mimetype)) {
            throw new BadRequestError(`Unsupported stream file type: ${file.mimetype}`);
          }

          // Get destination path
          const destPath = uploadService.getStreamDestinationPath(
            videoId,
            format,
            resolution,
            file.filename
          );

          if (!destPath) {
            throw new BadRequestError(`Invalid filename: ${file.filename}`);
          }

          // Save file
          await uploadService.saveUploadedFile(file, destPath);
        }
      }

      // Handle stream upload completion
      const result = uploadService.handleStreamUploadComplete({
        videoId,
        format,
        resolution,
      });

      this.sendSuccess(reply, result);
    } catch (error) {
      await videoService.setError(videoId, true);
      throw error;
    }
  };

  /**
   * Upload thumbnail image
   * POST /videos/:videoId/images/thumbnail
   */
  uploadThumbnail = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await this.handleImageUpload(request, reply, 'thumbnail', 'thumbnailFile');
  };

  /**
   * Upload preview image
   * POST /videos/:videoId/images/preview
   */
  uploadPreview = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await this.handleImageUpload(request, reply, 'preview', 'previewFile');
  };

  /**
   * Upload poster image
   * POST /videos/:videoId/images/poster
   */
  uploadPoster = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await this.handleImageUpload(request, reply, 'poster', 'posterFile');
  };

  /**
   * Handle image upload (shared logic for thumbnail, preview, poster)
   */
  private readonly handleImageUpload = async (
    request: FastifyRequest,
    reply: FastifyReply,
    imageType: ImageType,
    fieldName: string
  ): Promise<void> => {
    const videoService = this.getVideoService();
    const uploadService = this.getVideoUploadService();
    const { videoId } = request.params as VideoIdParams;

    // Validate video exists
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    // Process multipart upload
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === fieldName) {
        const file = part;

        // Validate mime type
        if (!uploadService.isValidImageMimeType(file.mimetype)) {
          throw new BadRequestError(
            `Unsupported image type: ${file.mimetype}. Only JPEG is supported.`
          );
        }

        // Get destination path
        const destPath = uploadService.getImageDestinationPath(videoId, imageType);

        // Ensure directory exists
        fs.mkdirSync(destPath, { recursive: true });

        // Save with correct filename
        const fileName = `${imageType}.jpg`;
        const filePath = path.join(destPath, fileName);
        const buffer = await file.toBuffer();
        fs.writeFileSync(filePath, buffer);
      }
    }

    // Handle upload completion
    const result = await uploadService.handleImageUploadComplete({
      videoId,
      imageType,
    });

    this.sendSuccess(reply, result);
  };

  /**
   * Add video to MoarTube index
   * POST /videos/:videoId/index/add
   */
  addToIndex = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { containsAdultContent, termsOfServiceAgreed, cloudflareTurnstileToken } =
      request.body as {
        containsAdultContent: boolean;
        termsOfServiceAgreed: boolean;
        cloudflareTurnstileToken: string;
      };

    // Validate required parameters
    if (typeof containsAdultContent !== 'boolean') {
      throw new BadRequestError('containsAdultContent is required');
    }

    if (termsOfServiceAgreed !== true) {
      throw new BadRequestError('You must agree to the Terms of Service');
    }

    if (!cloudflareTurnstileToken || typeof cloudflareTurnstileToken !== 'string') {
      throw new BadRequestError('cloudflareTurnstileToken is required');
    }

    // Validate video exists
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    // Add to index
    const result = await videoService.addToIndex(videoId, {
      containsAdultContent,
      termsOfServiceAgreed,
      cloudflareTurnstileToken,
    });

    if (!result.success) {
      // Return error response with appropriate status code
      const statusCode = result.isRequestTooLarge ? 413 : 400;
      return reply.status(statusCode).send({
        isError: true,
        message: result.message ?? 'Failed to add video to index',
      });
    }

    this.sendSuccess(reply, { videoId }, 'Video added to index');
  };

  /**
   * Remove video from MoarTube index
   * POST /videos/:videoId/index/remove
   */
  removeFromIndex = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;
    const { cloudflareTurnstileToken } = request.body as {
      cloudflareTurnstileToken: string;
    };

    if (!cloudflareTurnstileToken || typeof cloudflareTurnstileToken !== 'string') {
      throw new BadRequestError('cloudflareTurnstileToken is required');
    }

    // Validate video exists
    const video = await videoService.getVideo(videoId);
    if (!video) {
      throw new NotFoundError(`Video not found: ${videoId}`);
    }

    // Remove from index
    await videoService.removeFromIndex(videoId, cloudflareTurnstileToken);

    this.sendSuccess(reply, { videoId }, 'Video removed from index');
  };
}
