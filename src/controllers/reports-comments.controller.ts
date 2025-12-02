/**
 * Reports Comments Controller
 *
 * Handles comment report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.controller';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments.repository';
import type { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments.repository';
import { isReportIdValid } from '../utils';

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
      this.sendError(reply, 'error communicating with the MoarTube node');
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

      if (!isReportIdValid(reportId)) {
        this.sendError(reply, 'invalid report id');
        return;
      }

      const reportIdNum = parseInt(reportId, 10);
      const report = await this.commentReportRepository.findById(reportIdNum);

      if (!report) {
        this.sendError(reply, 'report with id does not exist');
        return;
      }

      // Create archive record
      await this.commentReportsArchiveRepository.create({
        reportId: report.reportId,
        timestamp: report.timestamp,
        commentTimestamp: report.commentTimestamp,
        videoId: report.videoId,
        commentId: report.commentId,
        email: report.email,
        type: report.type,
        message: report.message,
      });

      // Delete original report
      await this.commentReportRepository.delete(reportIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
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

      if (!isReportIdValid(reportId)) {
        this.sendError(reply, 'invalid report id');
        return;
      }

      const reportIdNum = parseInt(reportId, 10);
      await this.commentReportRepository.delete(reportIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
