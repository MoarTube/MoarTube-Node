/**
 * Reports Archive Videos Controller
 *
 * Handles archived video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base';
import type { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos';
import { isArchiveIdValid } from '../utils';

/**
 * Request params for archive operations
 */
export interface ArchiveIdParams {
  archiveId: string;
}

/**
 * ReportsArchiveVideosController class
 *
 * Handles:
 * - Get all archived video reports
 * - Delete an archived video report
 */
export class ReportsArchiveVideosController extends BaseController {
  constructor(private readonly videoReportsArchiveRepository: ReportsArchiveVideosRepository) {
    super('ReportsArchiveVideosController');
  }

  /**
   * GET /reports/archive/videos
   *
   * Get all archived video reports
   */
  getAllArchives = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const reports = await this.videoReportsArchiveRepository.findAll();

      this.sendSuccess(reply, { reports });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * DELETE /reports/archive/videos/:archiveId/delete
   *
   * Delete an archived video report
   */
  deleteArchive = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { archiveId } = request.params as ArchiveIdParams;

      if (!isArchiveIdValid(archiveId)) {
        this.sendError(reply, 'invalid archive id');
        return;
      }

      const archiveIdNum = parseInt(archiveId, 10);
      await this.videoReportsArchiveRepository.delete(archiveIdNum);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
