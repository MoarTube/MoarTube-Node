/**
 * Links Service
 *
 * Service layer for social link operations including CRUD operations.
 */
import { BaseService } from './base.js';
import type { Logger } from '../utils/logger.js';
import type { CreateLinkInput } from './interfaces.js';
import type { LinksRepository } from '../database/repositories/sqlite/links.js';
import type { DrizzleLink } from '../database/schemas/sqlite/index.js';

/**
 * LinksService class
 *
 * Handles all social link-related business logic including:
 * - Link CRUD operations
 */
export class LinksService extends BaseService {
  private readonly linksRepository: LinksRepository;

  constructor(logger: Logger, linksRepository: LinksRepository) {
    super('LinksService', logger);
    this.linksRepository = linksRepository;
  }

  /**
   * Get all links
   */
  async getAllLinks(): Promise<DrizzleLink[]> {
    return this.withErrorLogging('getAllLinks', async () => {
      return this.linksRepository.findAll();
    });
  }

  /**
   * Create a new link
   */
  async createLink(data: CreateLinkInput): Promise<DrizzleLink> {
    return this.withErrorLogging('createLink', async () => {
      return this.linksRepository.create({
        url: data.url,
        svg_graphic: data.svgGraphic,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Delete a link
   */
  async deleteLink(linkId: number): Promise<boolean> {
    return this.withErrorLogging('deleteLink', async () => {
      return this.linksRepository.delete(linkId);
    });
  }
}
