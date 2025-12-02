/**
 * Reports Controller
 *
 * Handles report count endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.controller';
import type { VideoReportRepository } from '../database/repositories/video-report.repository';
import type { CommentReportRepository } from '../database/repositories/comment-report.repository';

/**
 * ReportsController class
 *
 * Handles:
 * - Get report counts
 */
export class ReportsController extends BaseController {
  constructor(
    private readonly videoReportRepository: VideoReportRepository,
    private readonly commentReportRepository: CommentReportRepository
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
