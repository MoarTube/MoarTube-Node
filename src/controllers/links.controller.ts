/**
 * Links Controller
 *
 * Handles social link management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import type { LinkRepository } from '../database/repositories/link.repository';
import type { CloudflareService } from '../services/cloudflare.service';
import { getCurrentUnixTimestamp } from '../utils';

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
  constructor(
    private readonly linkRepository: LinkRepository,
    private readonly cloudflareService: CloudflareService
  ) {
    super('LinksController');
  }

  /**
   * GET /links/all
   *
   * Get all social links
   */
  getAllLinks = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const links = await this.linkRepository.findAll();
      this.sendSuccess(reply, { links });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /links/add
   *
   * Add a new social link
   */
  addLink = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { url, svgGraphic } = request.body as AddLinkBody;

      const timestamp = getCurrentUnixTimestamp();

      const link = await this.linkRepository.create({
        url,
        svgGraphic,
        timestamp,
      });

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      this.sendSuccess(reply, { link });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /links/delete
   *
   * Delete a social link
   */
  deleteLink = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { linkId } = request.body as DeleteLinkBody;

      const deleted = await this.linkRepository.delete(linkId);

      if (!deleted) {
        this.sendError(reply, 'link not found', 404);
        return;
      }

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
