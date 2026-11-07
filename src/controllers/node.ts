/** Authenticated moderation activity APIs used by MoarTube Client. */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { CommentsService, ReportsService } from '@services/index.js';
import { getConfig } from '@config/index.js';

export interface ContentCheckedBody {
  contentType: 'comments' | 'videoReports' | 'commentReports';
}

export class NodeController extends BaseController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly reportsService: ReportsService
  ) {
    super('NodeController');
  }
  /**
   * GET /node/newContentCounts
   *
   * Get counts of new content since last check
   */
  getNewContentCounts = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const config = getConfig();

      const lastCheckedContentTracker = config.lastCheckedContentTracker;

      const lastCheckedCommentsTimestamp = lastCheckedContentTracker.lastCheckedCommentsTimestamp;
      const lastCheckedVideoReportsTimestamp =
        lastCheckedContentTracker.lastCheckedVideoReportsTimestamp;
      const lastCheckedCommentReportsTimestamp =
        lastCheckedContentTracker.lastCheckedCommentReportsTimestamp;

      // Count new content since last check
      const newCommentsCount = await this.commentsService.countCommentsNewerThan(
        lastCheckedCommentsTimestamp
      );
      const newVideoReportsCount = await this.reportsService.countVideoReportsNewerThan(
        lastCheckedVideoReportsTimestamp
      );
      const newCommentReportsCount = await this.reportsService.countCommentReportsNewerThan(
        lastCheckedCommentReportsTimestamp
      );

      return await this.sendSuccess(reply, {
        newContentCounts: {
          newCommentsCount,
          newVideoReportsCount,
          newCommentReportsCount,
        },
      });
    } catch (error) {
      this.logger.error('Get new content counts failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /node/contentChecked
   *
   * Mark content type as checked
   */
  contentChecked = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { contentType } = request.body as ContentCheckedBody;

      const config = getConfig();

      const timestamp = Date.now();

      switch (contentType) {
        case 'comments':
          config.updateLastCheckedContentTracker({ lastCheckedCommentsTimestamp: timestamp });
          break;
        case 'videoReports':
          config.updateLastCheckedContentTracker({ lastCheckedVideoReportsTimestamp: timestamp });
          break;
        case 'commentReports':
          config.updateLastCheckedContentTracker({ lastCheckedCommentReportsTimestamp: timestamp });
          break;
      }

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Content checked failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
