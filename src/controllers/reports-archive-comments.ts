/**
 * Reports Archive Comments Controller
 *
 * Handles archived comment report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base';
import type { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments';
import { isArchiveIdValid } from '../utils';

/**
 * Request params for archive operations
 */
export interface CommentArchiveIdParams {
  archiveId: string;
}

/**
 * ReportsArchiveCommentsController class
 *
 * Handles:
 * - Get all archived comment reports
 * - Delete an archived comment report
 */
export class ReportsArchiveCommentsController extends BaseController {
  constructor(private readonly commentReportsArchiveRepository: ReportsArchiveCommentsRepository) {
    super('ReportsArchiveCommentsController');
  }

  /**
   * GET /reports/archive/comments
   *
   * Get all archived comment reports
   */
  getAllArchives = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const reports = await this.commentReportsArchiveRepository.findAll();

      this.sendSuccess(reply, { reports });
    } catch (error) {
      this.logger.error(
        'Get all archived comment reports failed',
        error instanceof Error ? error : null
      );
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/archive/comments/:archiveId/delete
   *
   * Delete an archived comment report
   */
  deleteArchive = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { archiveId } = request.params as CommentArchiveIdParams;

      if (!isArchiveIdValid(archiveId)) {
        this.sendError(reply, 'invalid archive id');
        return;
      }

      const archiveIdNum = Number.parseInt(archiveId, 10);
      await this.commentReportsArchiveRepository.delete(archiveIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.logger.error(
        'Delete archived comment report failed',
        error instanceof Error ? error : null
      );
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
