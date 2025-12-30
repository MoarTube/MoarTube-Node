/**
 * Reports Archive Videos Controller
 *
 * Handles archived video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from '@controllers/base.js';
import type { ReportsService } from '@services/reports.js';

/**
 * Request params for archive operations
 */
export interface ArchiveIdParams {
  archiveId: number;
}

/**
 * ReportsArchiveVideosController class
 *
 * Handles:
 * - Get all archived video reports
 * - Delete an archived video report
 */
export class ReportsArchiveVideosController extends BaseController {
  private readonly reportsService: ReportsService;

  constructor(reportsService: ReportsService) {
    super('ReportsArchiveVideosController');
    this.reportsService = reportsService;
  }

  /**
   * GET /reports/archive/videos
   *
   * Get all archived video reports
   */
  getAllArchives = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.reportsService.getArchivedVideoReports();

      return await this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error('Failed to get all archived video reports', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/archive/videos/:archiveId/delete
   *
   * Delete an archived video report
   */
  deleteArchive = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { archiveId } = request.params as ArchiveIdParams;

      await this.reportsService.deleteArchivedVideoReport(archiveId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to delete archived video report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
