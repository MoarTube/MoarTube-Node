/**
 * Comment Service
 *
 * Service layer for comment-related business logic including CRUD operations
 * and integration with video comment counts.
 */

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { CreateCommentInput } from '@services/interfaces.js';
import type {
  ICommentsRepository,
  SQLiteComment,
  SQLiteNewComment,
  PostgresComment,
  PostgresNewComment,
} from '@database/index.js';
import sanitizeHtml from 'sanitize-html';

/**
 * CommentService class
 *
 * Handles all comment-related business logic including:
 * - Comment CRUD operations
 * - Video comment count management
 * - Comment search functionality
 */
interface CachedComment {
  commentId: number;
  timestamp: number;
  commentPlainTextSanitized: string;
  replyIds: number[];
  hasMoreReplies: boolean;
}

export class CommentsService extends BaseService {
  private readonly commentsRepository:
    | ICommentsRepository<SQLiteComment, SQLiteNewComment>
    | ICommentsRepository<PostgresComment, PostgresNewComment>;
  constructor(
    logger: Logger,
    commentsRepository:
      | ICommentsRepository<SQLiteComment, SQLiteNewComment>
      | ICommentsRepository<PostgresComment, PostgresNewComment>
  ) {
    super('CommentService', logger);
    this.commentsRepository = commentsRepository;
  }

  /**
   * Get a single comment by ID
   */
  async getComment(
    videoId: string,
    commentId: number,
    timestamp?: number
  ): Promise<SQLiteComment | PostgresComment | null> {
    return this.withErrorLogging('getComment', async () => {
      return this.commentsRepository.findById(videoId, commentId, timestamp);
    });
  }

  /**
   * Get comments for a specific video
   */
  /** Indexed relationships return at most 100 reply IDs and one lookahead row. */
  async getCommentBacklinks(
    videoId: string,
    commentId: number,
    beforeReplyId?: number
  ): Promise<{ replyIds: number[]; hasMore: boolean }> {
    const rows = await this.commentsRepository.getBacklinksForComments(
      videoId,
      [commentId],
      beforeReplyId
    );
    return {
      replyIds: rows.slice(0, 100).map((row) => row.reply_id),
      hasMore: rows.length > 100,
    };
  }

  async formatComments(
    videoId: string,
    comments: (SQLiteComment | PostgresComment)[]
  ): Promise<CachedComment[]> {
    const edges = await this.commentsRepository.getBacklinksForComments(
      videoId,
      comments.map((c) => c.comment_id)
    );
    const replies = new Map<number, number[]>();
    for (const edge of edges) {
      const parent = edge.parent_id,
        ids = replies.get(parent) ?? [];
      ids.push(edge.reply_id);
      replies.set(parent, ids);
    }
    return comments.map((c) => ({
      commentId: c.comment_id,
      timestamp: c.timestamp,
      commentPlainTextSanitized: c.comment_plain_text_sanitized,
      replyIds: (replies.get(c.comment_id) ?? []).slice(0, 100),
      hasMoreReplies: (replies.get(c.comment_id)?.length ?? 0) > 100,
    }));
  }

  async getCacheEpoch(): Promise<string> {
    return this.commentsRepository.getCacheEpoch();
  }

  async getCacheVersion(videoId: string): Promise<number> {
    return this.commentsRepository.getCacheVersion(videoId);
  }

  async getCacheChanges(
    videoId: string,
    since: number,
    epoch?: string
  ): Promise<{
    comments: CachedComment[];
    deletedIds: number[];
    reset: boolean;
    epoch: string;
    version: number;
    hasMore: boolean;
  }> {
    const latest = await this.getCacheVersion(videoId);
    const currentEpoch = await this.getCacheEpoch();
    const reset = (epoch !== undefined && epoch !== currentEpoch) || since > latest;
    const changes = await this.commentsRepository.getCacheChanges(videoId, reset ? 0 : since);
    const page = changes.slice(0, 100);
    const rows = await this.commentsRepository.findByIds(
      videoId,
      page.filter((c) => !c.deleted).map((c) => c.comment_id)
    );
    const comments = await this.formatComments(videoId, rows);
    return {
      comments,
      deletedIds: page.filter((c) => c.deleted).map((c) => c.comment_id),
      reset,
      epoch: currentEpoch,
      version:
        changes.length > 100
          ? page.reduce((version, c) => Math.max(version, c.version), 0)
          : latest,
      hasMore: changes.length > 100,
    };
  }

  async getRecentComments(videoId: string) {
    return this.commentsRepository.findByVideoId(videoId, { limit: 101, offset: 0 });
  }

  async getCommentsForVideo(
    videoId: string,
    type: string,
    sort: string,
    timestamp: number,
    cursorId?: number
  ): Promise<(SQLiteComment | PostgresComment)[]> {
    return this.withErrorLogging('getCommentsForVideo', async () => {
      // Validate parameters
      if (type !== 'before' && type !== 'after') {
        throw new Error('Type must be "before" or "after"');
      }
      if (sort !== 'ascending' && sort !== 'descending') {
        throw new Error('Sort must be "ascending" or "descending"');
      }

      if (cursorId !== undefined) {
        return this.commentsRepository.findByVideoIdWithTimestampFilter(
          videoId,
          type,
          sort,
          timestamp,
          cursorId
        );
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
  async createComment(data: CreateCommentInput): Promise<SQLiteComment | PostgresComment> {
    return this.withErrorLogging('createComment', async () => {
      const timestamp = this.getCurrentTimestampMs();

      const commentPlainTextSanitized = sanitizeHtml(data.commentPlainText, {
        allowedTags: [],
        allowedAttributes: {},
      });

      // Create comment data
      const commentData: SQLiteNewComment | PostgresNewComment = {
        video_id: data.videoId,
        comment_plain_text_sanitized: commentPlainTextSanitized,
        timestamp,
      };

      // Create the comment
      const comment = await this.commentsRepository.create(commentData);

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

      // Database triggers keep the video counter in the same transaction as deletion.

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
  ): Promise<(SQLiteComment | PostgresComment)[]> {
    return await this.commentsRepository.search(
      limit,
      sortDirection,
      timestamp,
      videoId,
      searchTerm
    );
  }
}
