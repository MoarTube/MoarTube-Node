/**
 * Reports Controller
 *
 * Handles report count endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsService } from '../services/reports.js';

/**
 * ReportsController class
 *
 * Handles:
 * - Get report counts
 */
export class ReportsController extends BaseController {
  constructor(private readonly reportsService: ReportsService) {
    super('ReportsController');
  }

  /**
   * GET /reports/count
   *
   * Get counts of video and comment reports
   */
  getReportsCount = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const videoReportCount = await this.reportsService.countVideoReports();
      const commentReportCount = await this.reportsService.countCommentReports();
      const totalReportCount = videoReportCount + commentReportCount;

      return await this.sendSuccess(reply, {
        videoReportCount,
        commentReportCount,
        totalReportCount,
      });
    } catch (error) {
      this.logger.error('Get reports count failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
