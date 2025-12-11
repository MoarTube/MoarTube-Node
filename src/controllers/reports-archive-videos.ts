/**
 * Reports Archive Videos Controller
 *
 * Handles archived video report management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos.js';

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
  constructor(private readonly videoReportsArchiveRepository: ReportsArchiveVideosRepository) {
    super('ReportsArchiveVideosController');
  }

  /**
   * GET /reports/archive/videos
   *
   * Get all archived video reports
   */
  getAllArchives = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const reports = await this.videoReportsArchiveRepository.findAll();

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

      await this.videoReportsArchiveRepository.delete(archiveId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Failed to delete archived video report', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
