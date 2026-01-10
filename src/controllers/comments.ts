/**
 * Comments Controller
 *
 * Handles comment search and reporting endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import sanitizeHtml from 'sanitize-html';

import { BaseController } from '@controllers/base.js';
import type { CommentsService, ReportsService, VideosService, CloudflareService, ReportType } from '@services/index.js';
import { getConfig } from '@config/index.js';

/**
 * Query parameters for comment search
 */
export interface CommentSearchInput {
  limit: number;
  sortDirection: string;
  timestamp: number;
  videoId?: string;
  searchTerm?: string;
}

/**
 * Request params for comment report
 */
export interface CommentIdParams {
  commentId: number;
}

/**
 * Request body for reporting a comment
 */
export interface CommentReportBody {
  videoId: string;
  timestamp: number;
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
  private readonly commentsService: CommentsService;
  private readonly reportsService: ReportsService;
  private readonly videosService: VideosService;
  private readonly cloudflareService: CloudflareService;

  constructor(
    commentsService: CommentsService,
    reportsService: ReportsService,
    videosService: VideosService,
    cloudflareService: CloudflareService
  ) {
    super('CommentsController');
    this.commentsService = commentsService;
    this.reportsService = reportsService;
    this.videosService = videosService;
    this.cloudflareService = cloudflareService;
  }

  /**
   * GET /comments/search
   *
   * Search comments with optional filters
   */
  search = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { limit, sortDirection, timestamp, videoId, searchTerm } =
        request.query as CommentSearchInput;

      const comments = await this.commentsService.search(
        limit,
        sortDirection,
        timestamp,
        videoId,
        searchTerm
      );

      return await this.sendSuccess(reply, { comments });
    } catch (error) {
      this.logger.error('Comment search failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /comments/:commentId/report
   *
   * Report a comment
   */
  reportComment = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
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

      const config = getConfig();

      const nodeSettings = config.nodeSettings;

      // Check if reports are enabled globally
      if (!nodeSettings.isReportsEnabled) {
        return await this.sendError(reply, 'reporting is currently disabled');
      }

      // Validate Cloudflare Turnstile if enabled
      if (nodeSettings.isCloudflareTurnstileEnabled) {
        if (cloudflareTurnstileToken.length === 0) {
          return await this.sendError(
            reply,
            'human verification was enabled on this MoarTube Node, please refresh your browser'
          );
        }

        const cloudflareConnectingIp = request.headers['cf-connecting-ip'] as string;
        const isValidToken = await this.cloudflareService.validateTurnstileToken(
          cloudflareTurnstileToken,
          cloudflareConnectingIp
        );

        if (!isValidToken) {
          return await this.sendError(reply, 'human verification failed');
        }
      }

      const comment = await this.commentsService.getComment(videoId, commentId, timestamp);

      if (!comment) {
        return await this.sendError(reply, 'this comment no longer exists');
      }

      // Check if video exists and has reports enabled
      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        return await this.sendError(reply, 'this video no longer exists');
      }

      if (!video.is_reports_enabled) {
        return await this.sendError(reply, 'reporting is currently disabled');
      }

      // Sanitize input
      const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
      const sanitizedMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} });

      // Create the report
      await this.reportsService.createCommentReport({
        videoId,
        commentId,
        commentTimestamp: comment.timestamp,
        email: sanitizedEmail,
        type: reportType as ReportType,
        message: sanitizedMessage,
      });

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Comment report failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
