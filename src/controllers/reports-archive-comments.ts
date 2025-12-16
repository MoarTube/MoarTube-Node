/**
 * Reports Archive Comments Controller
 *
 * Handles archived comment report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsService } from '../services/reports.js';

/**
 * Request params for archive operations
 */
export interface CommentArchiveIdParams {
  archiveId: number;
}

/**
 * ReportsArchiveCommentsController class
 *
 * Handles:
 * - Get all archived comment reports
 * - Delete an archived comment report
 */
export class ReportsArchiveCommentsController extends BaseController {
  private readonly reportsService: ReportsService;

  constructor(reportsService: ReportsService) {
    super('ReportsArchiveCommentsController');
    this.reportsService = reportsService;
  }

  /**
   * GET /reports/archive/comments
   *
   * Get all archived comment reports
   */
  getAllArchives = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.reportsService.getArchivedCommentReports();

      return await this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error('Get all archived comment reports failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/archive/comments/:archiveId/delete
   *
   * Delete an archived comment report
   */
  deleteArchive = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { archiveId } = request.params as CommentArchiveIdParams;

      await this.reportsService.deleteArchivedCommentReport(archiveId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Delete archived comment report failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
