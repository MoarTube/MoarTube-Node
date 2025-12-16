/**
 * Reports Comments Controller
 *
 * Handles comment report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsService } from '../services/reports.js';

/**
 * Request body for archiving a report
 */
export interface ArchiveCommentReportBody {
  reportId: number;
}

/**
 * Request params for report operations
 */
export interface CommentReportIdParams {
  reportId: number;
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
  constructor(private readonly reportsService: ReportsService) {
    super('ReportsCommentsController');
  }

  /**
   * GET /reports/comments
   *
   * Get all comment reports
   */
  getAllReports = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.reportsService.getCommentReports();

      return await this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error('Failed to get all comment reports', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * POST /reports/comments/archive
   *
   * Archive a comment report
   */
  archiveReport = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { reportId } = request.body as ArchiveCommentReportBody;

      await this.reportsService.archiveCommentReport(reportId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to archive comment report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * DELETE /reports/comments/:reportId/delete
   *
   * Delete a comment report
   */
  deleteReport = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { reportId } = request.params as CommentReportIdParams;

      await this.reportsService.deleteCommentReport(reportId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to delete comment report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };
}
