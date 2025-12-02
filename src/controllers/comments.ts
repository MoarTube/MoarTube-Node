/**
 * Comments Controller
 *
 * Handles comment search and reporting endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import sanitizeHtml from 'sanitize-html';

import { BaseController } from './base';
import type { CommentsRepository } from '../database/repositories/comments';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments';
import type { VideosRepository } from '../database/repositories/videos';
import type { CloudflareService } from '../services/cloudflare';
import { getConfig } from '../config';
import {
  isCommentIdValid,
  isReportEmailValid,
  isReportTypeValid,
  isReportMessageValid,
  isCloudflareTurnstileTokenValid,
  isTimestampValid,
  isLimitValid,
  isSearchTermValid,
  isVideoIdValid,
} from '../utils';

/**
 * Query parameters for comment search
 */
export interface CommentSearchQuery {
  videoId?: string;
  searchTerm?: string;
  timestamp?: string;
  limit?: string;
}

/**
 * Request params for comment report
 */
export interface CommentIdParams {
  commentId: string;
}

/**
 * Request body for reporting a comment
 */
export interface CommentReportBody {
  videoId: string;
  timestamp: string;
  email: string;
  reportType: string;
  message: string;
  cloudflareTurnstileToken?: string;
}

/**
 * CommentsController class
 *
 * Handles:
 * - Comment search
 * - Comment reporting
 */
export class CommentsController extends BaseController {
  constructor(
    private readonly commentRepository: CommentsRepository,
    private readonly commentReportRepository: ReportsCommentsRepository,
    private readonly videoRepository: VideosRepository,
    private readonly cloudflareService: CloudflareService
  ) {
    super('CommentsController');
  }

  /**
   * GET /comments/search
   *
   * Search comments with optional filters
   */
  search = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const {
        videoId = '',
        searchTerm = '',
        timestamp = '',
        limit = '',
      } = request.query as CommentSearchQuery;

      if (
        !isVideoIdValid(videoId, true) ||
        !isSearchTermValid(searchTerm) ||
        !isTimestampValid(timestamp) ||
        !isLimitValid(limit)
      ) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Use the repository's search method
      const searchOptions: {
        videoId?: string;
        searchTerm?: string;
        beforeTimestamp?: number;
        limit?: number;
        sortDirection: 'desc';
      } = {
        sortDirection: 'desc',
      };

      if (videoId.length > 0) {
        searchOptions.videoId = videoId;
      }
      if (searchTerm.length > 0) {
        searchOptions.searchTerm = searchTerm;
      }
      if (timestamp.length > 0) {
        searchOptions.beforeTimestamp = Number.parseInt(timestamp, 10);
      }
      if (limit.length > 0) {
        searchOptions.limit = Number.parseInt(limit, 10);
      }

      const comments = await this.commentRepository.search(searchOptions);

      this.sendSuccess(reply, { comments });
    } catch (error) {
      this.logger.error('Comment search failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /comments/:commentId/report
   *
   * Report a comment
   */
  reportComment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { commentId } = request.params as CommentIdParams;
      const {
        videoId,
        timestamp,
        email,
        reportType,
        message,
        cloudflareTurnstileToken = '',
      } = request.body as CommentReportBody;

      // Validate all parameters
      if (
        !isVideoIdValid(videoId, false) ||
        !isCommentIdValid(commentId) ||
        !isTimestampValid(timestamp) ||
        !isReportEmailValid(email) ||
        !isReportTypeValid(reportType) ||
        !isReportMessageValid(message) ||
        !isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)
      ) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Check if reports are enabled globally
      if (!nodeSettings.isReportsEnabled) {
        this.sendError(reply, 'reporting is currently disabled');
        return;
      }

      // Validate Cloudflare Turnstile if enabled
      if (nodeSettings.isCloudflareTurnstileEnabled) {
        if (cloudflareTurnstileToken.length === 0) {
          this.sendError(
            reply,
            'human verification was enabled on this MoarTube Node, please refresh your browser'
          );
          return;
        }

        const cloudflareConnectingIp = request.headers['cf-connecting-ip'] as string;
        const isValidToken = await this.cloudflareService.validateTurnstileToken(
          cloudflareTurnstileToken,
          cloudflareConnectingIp
        );

        if (!isValidToken) {
          this.sendError(reply, 'human verification failed');
          return;
        }
      }

      // Verify comment exists
      const commentIdNum = Number.parseInt(commentId, 10);
      const comment = await this.commentRepository.findById(commentIdNum);

      if (!comment) {
        this.sendError(reply, 'this comment no longer exists');
        return;
      }

      // Verify the comment matches the video and timestamp
      if (comment.videoId !== videoId || comment.timestamp !== Number.parseInt(timestamp, 10)) {
        this.sendError(reply, 'this comment no longer exists');
        return;
      }

      // Check if video exists and has reports enabled
      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        this.sendError(reply, 'this video no longer exists');
        return;
      }

      if (!video.isReportsEnabled) {
        this.sendError(reply, 'reporting is currently disabled');
        return;
      }

      // Sanitize input
      const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
      const sanitizedMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} });

      // Create the report
      await this.commentReportRepository.create({
        commentId: String(commentIdNum),
        videoId,
        commentTimestamp: comment.timestamp,
        email: sanitizedEmail,
        type: reportType,
        message: sanitizedMessage,
        timestamp: Date.now(),
      });

      this.sendOk(reply);
    } catch (error) {
      this.logger.error('Comment report failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
