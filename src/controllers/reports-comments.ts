/**
 * Reports Comments Controller
 *
 * Handles comment report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments.js';
import type { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments.js';

/**
 * Request body for archiving a report
 */
export interface ArchiveCommentReportBody {
  reportId: string;
}

/**
 * Request params for report operations
 */
export interface CommentReportIdParams {
  reportId: string;
}

/**
 * ReportsCommentsController class
 *
 * Handles:
 * - Get all comment reports
 * - Archive a comment report
 * - Delete a comment report
 */
export class ReportsCommentsController extends BaseController {
  constructor(
    private readonly commentReportRepository: ReportsCommentsRepository,
    private readonly commentReportsArchiveRepository: ReportsArchiveCommentsRepository
  ) {
    super('ReportsCommentsController');
  }

  /**
   * GET /reports/comments
   *
   * Get all comment reports
   */
  getAllReports = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const reports = await this.commentReportRepository.findAll();

      this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error('Failed to get all comment reports', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * POST /reports/comments/archive
   *
   * Archive a comment report
   */
  archiveReport = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reportId } = request.body as ArchiveCommentReportBody;

      const reportIdNum = Number.parseInt(reportId, 10);
      const report = await this.commentReportRepository.findById(reportIdNum);

      if (!report) {
        this.sendError(reply, 'report with id does not exist', 404);
      } else {
        // Create archive record
        await this.commentReportsArchiveRepository.create({
          report_id: report.report_id,
          timestamp: report.timestamp,
          comment_timestamp: report.comment_timestamp,
          video_id: report.video_id,
          comment_id: report.comment_id,
          email: report.email,
          type: report.type,
          message: report.message,
        });

        // Delete original report
        await this.commentReportRepository.delete(reportIdNum);

        this.sendOk(reply);
      }
    } catch (error) {
      this.logger.error('Failed to archive comment report', error instanceof Error ? error : null);

      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * DELETE /reports/comments/:reportId/delete
   *
   * Delete a comment report
   */
  deleteReport = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reportId } = request.params as CommentReportIdParams;

      const reportIdNum = Number.parseInt(reportId, 10);
      await this.commentReportRepository.delete(reportIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.logger.error('Failed to delete comment report', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };
}
