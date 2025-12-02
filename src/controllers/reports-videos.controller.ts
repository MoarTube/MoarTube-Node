/**
 * Reports Videos Controller
 *
 * Handles video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.controller';
import type { VideoReportRepository } from '../database/repositories/video-report.repository';
import type { VideoReportsArchiveRepository } from '../database/repositories/video-reports-archive.repository';
import { isReportIdValid } from '../utils';

/**
 * Request body for archiving a report
 */
export interface ArchiveReportBody {
  reportId: string;
}

/**
 * Request params for report operations
 */
export interface ReportIdParams {
  reportId: string;
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
    private readonly videoReportRepository: VideoReportRepository,
    private readonly videoReportsArchiveRepository: VideoReportsArchiveRepository
  ) {
    super('ReportsVideosController');
  }

  /**
   * GET /reports/videos
   *
   * Get all video reports
   */
  getAllReports = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const reports = await this.videoReportRepository.findAll();

      this.sendSuccess(reply, { reports });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /reports/videos/archive
   *
   * Archive a video report
   */
  archiveReport = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reportId } = request.body as ArchiveReportBody;

      if (!isReportIdValid(reportId)) {
        this.sendError(reply, 'invalid report id');
        return;
      }

      const reportIdNum = parseInt(reportId, 10);
      const report = await this.videoReportRepository.findById(reportIdNum);

      if (!report) {
        this.sendError(reply, 'report with id does not exist');
        return;
      }

      // Create archive record
      await this.videoReportsArchiveRepository.create({
        reportId: report.reportId,
        timestamp: report.timestamp,
        videoTimestamp: report.videoTimestamp,
        videoId: report.videoId,
        email: report.email,
        type: report.type,
        message: report.message,
      });

      // Delete original report
      await this.videoReportRepository.delete(reportIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/videos/:reportId/delete
   *
   * Delete a video report
   */
  deleteReport = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reportId } = request.params as ReportIdParams;

      if (!isReportIdValid(reportId)) {
        this.sendError(reply, 'invalid report id');
        return;
      }

      const reportIdNum = parseInt(reportId, 10);
      await this.videoReportRepository.delete(reportIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
