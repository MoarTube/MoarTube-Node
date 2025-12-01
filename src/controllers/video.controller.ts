/**
 * Video Controller
 *
 * Handles HTTP requests for video-related operations.
 * Migrated from Express to Fastify with proper TypeScript types.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import type { IVideoService, ICommentService } from '../services/interfaces';
import { NotFoundError, BadRequestError } from '../errors';
import { resolve } from '../core/container';

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
  commentPlainTextSanitized: string;
  cloudflareTurnstileToken?: string;
}

/**
 * VideoController class
 *
 * Handles all video-related HTTP endpoints including:
 * - Video CRUD operations
 * - Video search and listing
 * - Video interactions (likes, dislikes, comments)
 * - Video publishing workflow
 */
export class VideoController extends BaseController {
  constructor() {
    super('VideoController');
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
      sortDirection = 'desc';
    } else if (sortTerm === 'oldest') {
      sortBy = 'creation_timestamp';
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
   * Increment view count
   * POST /videos/:videoId/view
   */
  incrementViews = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.incrementViews(videoId);

    this.sendSuccess(reply, { videoId });
  };

  /**
   * Like a video
   * POST /videos/:videoId/like
   */
  likeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.incrementLikes(videoId);

    // Get updated video to return current counts
    const video = await videoService.getVideo(videoId);

    this.sendSuccess(reply, {
      likes: video?.likes ?? 0,
      dislikes: video?.dislikes ?? 0,
    });
  };

  /**
   * Dislike a video
   * POST /videos/:videoId/dislike
   */
  dislikeVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const videoService = this.getVideoService();
    const { videoId } = request.params as VideoIdParams;

    await videoService.incrementDislikes(videoId);

    // Get updated video to return current counts
    const video = await videoService.getVideo(videoId);

    this.sendSuccess(reply, {
      likes: video?.likes ?? 0,
      dislikes: video?.dislikes ?? 0,
    });
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
    const commentService = this.getCommentService();
    const { videoId } = request.params as VideoIdParams;
    const { commentPlainTextSanitized } = request.body as CommentBody;

    if (!commentPlainTextSanitized || commentPlainTextSanitized.trim() === '') {
      throw new BadRequestError('Comment text is required');
    }

    const comment = await commentService.createComment({
      videoId,
      commentText: commentPlainTextSanitized,
    });

    this.sendSuccess(
      reply,
      {
        commentId: comment.id,
        timestamp: comment.timestamp,
      },
      'Comment added successfully'
    );
  };

  /**
   * Delete a comment
   * POST /videos/:videoId/comments/:commentId/delete
   */
  deleteComment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const commentService = this.getCommentService();
    const { commentId } = request.params as VideoIdParams & { commentId: string };

    const commentIdNum = parseInt(commentId, 10);
    if (isNaN(commentIdNum)) {
      throw new BadRequestError('Invalid comment ID');
    }

    const deleted = await commentService.deleteComment(commentIdNum);

    if (!deleted) {
      throw new NotFoundError(`Comment not found: ${commentId}`);
    }

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
}
