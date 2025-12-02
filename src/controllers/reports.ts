/**
 * Reports Controller
 *
 * Handles report count endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base';
import type { ReportsVideosRepository } from '../database/repositories/reports-videos';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments';

/**
 * ReportsController class
 *
 * Handles:
 * - Get report counts
 */
export class ReportsController extends BaseController {
  constructor(
    private readonly videoReportRepository: ReportsVideosRepository,
    private readonly commentReportRepository: ReportsCommentsRepository
  ) {
    super('ReportsController');
  }

  /**
   * GET /reports/count
   *
   * Get counts of video and comment reports
   */
  getReportsCount = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const videoReportCount = await this.videoReportRepository.count();
      const commentReportCount = await this.commentReportRepository.count();
      const totalReportCount = videoReportCount + commentReportCount;

      this.sendSuccess(reply, {
        videoReportCount,
        commentReportCount,
        totalReportCount,
      });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
