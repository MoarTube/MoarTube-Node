/**
 * Links Controller
 *
 * Public compatibility reader for Node Icons.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { LinksService } from '@services/index.js';

/**
 * LinksController class
 *
 * Handles:
 * - Get all social links
 */
export class LinksController extends BaseController {
  private readonly linksService: LinksService;

  constructor(linksService: LinksService) {
    super('LinksController');
    this.linksService = linksService;
  }

  /**
   * GET /links/all
   *
   * Get all social links
   */
  getAllLinks = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      reply.header('Cache-Control', 'no-store');
      const links = await this.linksService.getAllLinks();

      return await this.sendSuccess(reply, { links });
    } catch (error) {
      this.logger.error('Get all links failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
