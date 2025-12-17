/**
 * Comment Service
 *
 * Service layer for comment-related business logic including CRUD operations
 * and integration with video comment counts.
 */

import { BaseService } from './base.js';
import type { Logger } from '../utils/logger.js';
import type { CreateCommentInput } from './interfaces.js';
import type { CommentsRepository } from '../database/repositories/comments.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { DrizzleComment, DrizzleNewComment } from '../database/schemas/index.js';
import sanitizeHtml from 'sanitize-html';

/**
 * CommentService class
 *
 * Handles all comment-related business logic including:
 * - Comment CRUD operations
 * - Video comment count management
 * - Comment search functionality
 */
export class CommentsService extends BaseService {
  private readonly commentsRepository: CommentsRepository;
  private readonly videoRepository: VideosRepository;

  constructor(
    logger: Logger,
    commentsRepository: CommentsRepository,
    videosRepository: VideosRepository
  ) {
    super('CommentService', logger);
    this.commentsRepository = commentsRepository;
    this.videoRepository = videosRepository;
  }

  /**
   * Get a single comment by ID
   */
  async getComment(
    videoId: string,
    commentId: number,
    timestamp: number
  ): Promise<DrizzleComment | null> {
    return this.withErrorLogging('getComment', async () => {
      return this.commentsRepository.findById(videoId, commentId, timestamp);
    });
  }

  /**
   * Get comments for a specific video
   */
  async getCommentsForVideo(
    videoId: string,
    type: string,
    sort: string,
    timestamp: number
  ): Promise<DrizzleComment[]> {
    return this.withErrorLogging('getCommentsForVideo', async () => {
      // Validate parameters
      if (type !== 'before' && type !== 'after') {
        throw new Error('Type must be "before" or "after"');
      }
      if (sort !== 'ascending' && sort !== 'descending') {
        throw new Error('Sort must be "ascending" or "descending"');
      }

      return this.commentsRepository.findByVideoIdWithTimestampFilter(
        videoId,
        type,
        sort,
        timestamp
      );
    });
  }

  /**
   * Create a new comment
   */
  async createComment(data: CreateCommentInput): Promise<DrizzleComment> {
    return this.withErrorLogging('createComment', async () => {
      const timestamp = this.getCurrentTimestampMs();

      const commentPlainTextSanitized = sanitizeHtml(data.commentPlainText, {
        allowedTags: [],
        allowedAttributes: {},
      });

      // Create comment data
      const commentData: DrizzleNewComment = {
        video_id: data.videoId,
        comment_plain_text_sanitized: commentPlainTextSanitized,
        timestamp,
      };

      // Create the comment
      const comment = await this.commentsRepository.create(commentData);

      // Increment video comment count
      await this.videoRepository.incrementComments(data.videoId);

      return comment;
    });
  }

  /**
   * Delete a comment
   */
  async deleteComment(videoId: string, commentId: number, timestamp: number): Promise<boolean> {
    return this.withErrorLogging('deleteComment', async () => {
      // Get comment to find video ID
      const comment = await this.commentsRepository.findById(videoId, commentId, timestamp);

      if (!comment) {
        return false;
      }

      // Delete the comment
      const deleted = await this.commentsRepository.delete(videoId, commentId, timestamp);

      await this.videoRepository.decrementComments(comment.video_id);

      return deleted;
    });
  }

  /**
   * Delete all comments for a video
   */
  async deleteCommentsForVideo(videoId: string): Promise<number> {
    return this.withErrorLogging('deleteCommentsForVideo', async () => {
      this.logger.info('Deleting all comments for video', { videoId });

      const deletedCount = await this.commentsRepository.deleteByVideoId(videoId);

      // Reset video comment count to 0 (handled by video deletion usually)
      // No need to decrement one by one

      return deletedCount;
    });
  }

  /**
   * Count comments for a video
   */
  async countCommentsForVideo(videoId: string): Promise<number> {
    return this.commentsRepository.countByVideoId(videoId);
  }

  /**
   * Count comments newer than timestamp
   */
  async countCommentsNewerThan(timestamp: number): Promise<number> {
    return this.commentsRepository.countNewerThan(timestamp);
  }

  /**
   * Search comments across all videos
   *
   * @param searchTerm - Text to search for in comments
   * @param options - Pagination options
   * @returns Array of matching comments
   */
  async search(
    limit: number,
    sortDirection: string,
    timestamp: number,
    videoId?: string,
    searchTerm?: string
  ): Promise<DrizzleComment[]> {
    return await this.commentsRepository.search(
      limit,
      sortDirection,
      timestamp,
      videoId,
      searchTerm
    );
  }
}
