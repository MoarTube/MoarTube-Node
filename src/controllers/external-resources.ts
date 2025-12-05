/**
 * External Resources Controller
 *
 * Handles serving static assets (JavaScript, CSS, fonts, images).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { BaseController } from './base.js';
import { getConfig } from '../config/index.js';

/**
 * Route params for images
 */
interface ImageParams {
  imageName: string;
}

/**
 * ExternalResourcesController class
 *
 * Handles:
 * - Serve JavaScript files
 * - Serve CSS files
 * - Serve font files
 * - Serve image files (including custom node images)
 */
export class ExternalResourcesController extends BaseController {
  constructor() {
    super('ExternalResourcesController');
  }

  /**
   * Serve a static file with proper content type using streams
   */
  private async serveStaticFile(
    filePath: string,
    contentType: string,
    reply: FastifyReply
  ): Promise<FastifyReply> {
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send('File not found');
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    return reply
      .header('Content-Type', contentType)
      .header('Content-Length', stat.size)
      .send(stream);
  }

  /**
   * GET /external/resources/javascript/:filename
   *
   * Serve JavaScript files
   */
  getJavaScript = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { filename } = request.params as { filename: string };
      const config = getConfig();
      const filePath = path.join(config.paths.publicDirectoryPath, 'javascript', filename);

      await this.serveStaticFile(filePath, 'application/javascript', reply);
    } catch (error) {
      this.logger.error('Error serving JavaScript file', error instanceof Error ? error : null);
      this.sendError(reply, 'error serving JavaScript file', 500);
    }
  };

  /**
   * GET /external/resources/css/:filename
   *
   * Serve CSS files
   */
  getCss = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { filename } = request.params as { filename: string };
      const config = getConfig();
      const filePath = path.join(config.paths.publicDirectoryPath, 'css', filename);

      await this.serveStaticFile(filePath, 'text/css', reply);
    } catch (error) {
      this.logger.error('Error serving CSS file', error instanceof Error ? error : null);
      this.sendError(reply, 'error serving CSS file', 500);
    }
  };

  /**
   * GET /external/resources/fonts/:filename
   *
   * Serve font files
   */
  getFonts = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { filename } = request.params as { filename: string };
      const config = getConfig();
      const filePath = path.join(config.paths.publicDirectoryPath, 'fonts', filename);

      // Determine content type based on extension
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';

      if (ext === '.woff2') {
        contentType = 'font/woff2';
      } else if (ext === '.woff') {
        contentType = 'font/woff';
      } else if (ext === '.ttf') {
        contentType = 'font/ttf';
      } else if (ext === '.otf') {
        contentType = 'font/otf';
      } else if (ext === '.eot') {
        contentType = 'application/vnd.ms-fontobject';
      }

      await this.serveStaticFile(filePath, contentType, reply);
    } catch (error) {
      this.logger.error('Error serving font file', error instanceof Error ? error : null);
      this.sendError(reply, 'error serving font file', 500);
    }
  };

  /**
   * GET /external/resources/images/:imageName
   *
   * Serve image files (handles both public assets and custom node images)
   */
  getImage = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { imageName } = request.params as ImageParams;
      const config = getConfig();

      // Check for custom node images first
      let filePath: string;

      if (imageName === 'icon.png' || imageName === 'avatar.png' || imageName === 'banner.png') {
        // Check for custom image in data/images directory
        const customPath = path.join(config.paths.imagesDirectoryPath, imageName);
        const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', imageName);

        filePath = fs.existsSync(customPath) ? customPath : defaultPath;
      } else {
        // Regular public images
        filePath = path.join(config.paths.publicDirectoryPath, 'images', imageName);
      }

      // Determine content type based on extension
      const ext = path.extname(imageName).toLowerCase();
      let contentType = 'application/octet-stream';

      if (ext === '.png') {
        contentType = 'image/png';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.gif') {
        contentType = 'image/gif';
      } else if (ext === '.svg') {
        contentType = 'image/svg+xml';
      } else if (ext === '.webp') {
        contentType = 'image/webp';
      } else if (ext === '.ico') {
        contentType = 'image/x-icon';
      }

      await this.serveStaticFile(filePath, contentType, reply);
    } catch (error) {
      this.logger.error('Error serving image file', error instanceof Error ? error : null);
      this.sendError(reply, 'error serving image file', 500);
    }
  };
}
