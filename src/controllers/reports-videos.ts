/**
 * Reports Videos Controller
 *
 * Handles video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsVideosRepository } from '../database/repositories/reports-videos.js';
import type { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos.js';

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
  constructor(
    private readonly videoReportRepository: ReportsVideosRepository,
    private readonly videoReportsArchiveRepository: ReportsArchiveVideosRepository
  ) {
    super('ReportsVideosController');
  }

  /**
   * GET /reports/videos
   *
   * Get all video reports
   */
  getAllReports = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.videoReportRepository.findAll();

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

      const report = await this.videoReportRepository.findById(reportId);

      if (!report) {
        return await this.sendError(reply, 'report with id does not exist');
      }

      // Create archive record
      await this.videoReportsArchiveRepository.create({
        report_id: report.report_id,
        timestamp: report.timestamp,
        video_timestamp: report.video_timestamp,
        video_id: report.video_id,
        email: report.email,
        type: report.type,
        message: report.message,
      });

      // Delete original report
      await this.videoReportRepository.delete(reportId);

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

      await this.videoReportRepository.delete(reportId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to delete video report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
