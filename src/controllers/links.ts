/**
 * Links Controller
 *
 * Handles social link management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { LinksService, CloudflareService } from '@services/index.js';

/**
 * Request body for adding a link
 */
export interface AddLinkBody {
  url: string;
  svgGraphic: string;
}

/**
 * Request body for deleting a link
 */
export interface DeleteLinkBody {
  linkId: number;
}

/**
 * LinksController class
 *
 * Handles:
 * - Get all social links
 * - Add new social link
 * - Delete social link
 */
export class LinksController extends BaseController {
  private readonly linksService: LinksService;
  private readonly cloudflareService: CloudflareService;

  constructor(linksService: LinksService, cloudflareService: CloudflareService) {
    super('LinksController');
    this.linksService = linksService;
    this.cloudflareService = cloudflareService;
  }

  /**
   * GET /links/all
   *
   * Get all social links
   */
  getAllLinks = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const links = await this.linksService.getAllLinks();

      return await this.sendSuccess(reply, { links });
    } catch (error) {
      this.logger.error('Get all links failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /links/add
   *
   * Add a new social link
   */
  addLink = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { url, svgGraphic } = request.body as AddLinkBody;

      const link = await this.linksService.createLink({
        url,
        svgGraphic,
      });

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply, { link });
    } catch (error) {
      this.logger.error('Add link failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /links/delete
   *
   * Delete a social link
   */
  deleteLink = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { linkId } = request.body as DeleteLinkBody;

      const deleted = await this.linksService.deleteLink(linkId);

      if (!deleted) {
        return await this.sendError(reply, 'link not found', 404);
      } else {
        await this.cloudflareService.purgeAllWatchPages();
        await this.cloudflareService.purgeNodePage();

        return await this.sendSuccess(reply);
      }
    } catch (error) {
      this.logger.error('Delete link failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
