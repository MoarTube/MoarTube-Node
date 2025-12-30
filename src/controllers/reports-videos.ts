/**
 * Reports Videos Controller
 *
 * Handles video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from '@controllers/base.js';
import type { ReportsService } from '@services/reports.js';

/**
 * Request body for archiving a report
 */
export interface ArchiveReportBody {
  reportId: number;
}

/**
 * Request params for report operations
 */
export interface ReportIdParams {
  reportId: number;
}

/**
 * ReportsVideosController class
 *
 * Handles:
 * - Get all video reports
 * - Archive a video report
 * - Delete a video report
 */
export class ReportsVideosController extends BaseController {
  private readonly reportsService: ReportsService;

  constructor(reportsService: ReportsService) {
    super('ReportsVideosController');
    this.reportsService = reportsService;
  }

  /**
   * GET /reports/videos
   *
   * Get all video reports
   */
  getAllReports = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.reportsService.getVideoReports();

      return await this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error('Failed to get all video reports', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /reports/videos/archive
   *
   * Archive a video report
   */
  archiveReport = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { reportId } = request.body as ArchiveReportBody;

      await this.reportsService.archiveVideoReport(reportId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to archive video report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/videos/:reportId/delete
   *
   * Delete a video report
   */
  deleteReport = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { reportId } = request.params as ReportIdParams;

      await this.reportsService.deleteVideoReport(reportId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to delete video report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
