/**
 * Comment Service
 *
 * Service layer for comment-related business logic including CRUD operations
 * and integration with video comment counts.
 */

import { BaseService, type ServiceOptions } from './base.service';
import type {
  ICommentService,
  GetCommentsOptions,
  CreateCommentInput,
  IWebSocketService,
} from './interfaces';
import type { CommentsRepository } from '../database/repositories/comments.repository';
import type { VideosRepository } from '../database/repositories/videos.repository';
import type { DrizzleComment, DrizzleNewComment } from '../database/schema';
import type { PaginationOptions } from '../types/models';

/**
 * Comment service dependencies
 */
export interface CommentServiceDependencies {
  commentRepository: CommentsRepository;
  videoRepository?: VideosRepository;
  websocketService?: IWebSocketService;
}

/**
 * CommentService class
 *
 * Handles all comment-related business logic including:
 * - Comment CRUD operations
 * - Video comment count management
 * - Comment search functionality
 */
export class CommentService extends BaseService implements ICommentService {
  private readonly commentRepository: CommentsRepository;
  private readonly videoRepository: VideosRepository | undefined;
  private readonly websocketService: IWebSocketService | undefined;

  constructor(dependencies: CommentServiceDependencies, options?: ServiceOptions) {
    super('CommentService', options);
    this.commentRepository = dependencies.commentRepository;
    this.videoRepository = dependencies.videoRepository;
    this.websocketService = dependencies.websocketService;
  }

  /**
   * Get a single comment by ID
   */
  async getComment(commentId: number): Promise<DrizzleComment | null> {
    return this.withErrorLogging('getComment', async () => {
      return this.commentRepository.findById(commentId);
    });
  }

  /**
   * Get comments with filtering and pagination
   */
  async getComments(options?: GetCommentsOptions): Promise<DrizzleComment[]> {
    return this.withErrorLogging('getComments', async () => {
      if (options?.videoId !== undefined && options.videoId !== '') {
        const paginationOptions: PaginationOptions = {};
        if (options.limit !== undefined) {
          paginationOptions.limit = options.limit;
        }
        if (options.offset !== undefined) {
          paginationOptions.offset = options.offset;
        }
        return this.commentRepository.findByVideoId(options.videoId, paginationOptions);
      }

      // For now, return comments by video if specified, otherwise empty
      // In future could add global comment search
      return [];
    });
  }

  /**
   * Get comments for a specific video
   */
  async getCommentsForVideo(
    videoId: string,
    options?: PaginationOptions
  ): Promise<DrizzleComment[]> {
    return this.withErrorLogging('getCommentsForVideo', async () => {
      return this.commentRepository.findByVideoId(videoId, options);
    });
  }

  /**
   * Create a new comment
   */
  async createComment(data: CreateCommentInput): Promise<DrizzleComment> {
    return this.withErrorLogging('createComment', async () => {
      const timestamp = this.getCurrentTimestamp();

      // Create comment data
      const commentData: DrizzleNewComment = {
        videoId: data.videoId,
        commentPlainTextSanitized: data.commentText,
        timestamp,
      };

      this.logger.debug('Creating comment', {
        videoId: data.videoId,
        textLength: data.commentText.length,
      });

      // Create the comment
      const comment = await this.commentRepository.create(commentData);

      // Increment video comment count
      if (this.videoRepository) {
        await this.videoRepository.incrementComments(data.videoId);
      }

      // Broadcast new comment event
      if (this.websocketService) {
        this.websocketService.broadcastToNodes({
          eventName: 'echo',
          data: {
            eventName: 'comment_added',
            payload: {
              videoId: data.videoId,
              commentId: comment.id,
              timestamp,
            },
          },
        });
      }

      return comment;
    });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: number): Promise<boolean> {
    return this.withErrorLogging('deleteComment', async () => {
      // Get comment to find video ID
      const comment = await this.commentRepository.findById(commentId);
      if (!comment) {
        return false;
      }

      this.logger.debug('Deleting comment', {
        commentId,
        videoId: comment.videoId,
      });

      // Delete the comment
      const deleted = await this.commentRepository.delete(commentId);

      if (deleted && this.videoRepository) {
        // Decrement video comment count
        await this.videoRepository.decrementComments(comment.videoId);
      }

      return deleted;
    });
  }

  /**
   * Delete all comments for a video
   */
  async deleteCommentsForVideo(videoId: string): Promise<number> {
    return this.withErrorLogging('deleteCommentsForVideo', async () => {
      this.logger.info('Deleting all comments for video', { videoId });

      const deletedCount = await this.commentRepository.deleteByVideoId(videoId);

      // Reset video comment count to 0 (handled by video deletion usually)
      // No need to decrement one by one

      return deletedCount;
    });
  }

  /**
   * Count comments for a video
   */
  async countCommentsForVideo(videoId: string): Promise<number> {
    return this.commentRepository.countByVideoId(videoId);
  }

  /**
   * Search comments across all videos
   *
   * @param searchTerm - Text to search for in comments
   * @param options - Pagination options
   * @returns Array of matching comments
   */
  searchComments(searchTerm: string, _options?: PaginationOptions): DrizzleComment[] {
    // This would need a new repository method with LIKE query
    // For now, returning empty array - to be implemented when needed
    this.logger.debug('Comment search requested', { searchTerm });
    return [];
  }

  /**
   * Get comments created after a specific timestamp
   *
   * @param videoId - Video to get comments for
   * @param afterTimestamp - Only return comments after this timestamp
   * @param limit - Maximum number of comments to return
   * @returns Array of comments
   */
  async getNewComments(
    videoId: string,
    afterTimestamp: number,
    limit: number = 50
  ): Promise<DrizzleComment[]> {
    // Would need repository method - for now filter in memory
    const comments = await this.commentRepository.findByVideoId(videoId, { limit: 100 });
    return comments.filter((c) => c.timestamp > afterTimestamp).slice(0, limit);
  }
}
