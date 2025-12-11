/**
 * Status Controller
 *
 * Handles status and health check endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.js';
import { getConfig } from '../config/index.js';
import type { Container } from '../core/container.js';

/**
 * Status information response
 */
interface StatusInformation {
  nodeVideoCount: number;
  nodeId: string;
  nodeName: string;
  nodeAbout: string;
  publicNodeProtocol: string;
  publicNodeAddress: string;
  publicNodePort: string;
  cloudflareTurnstileSiteKey: string;
}

/**
 * StatusController class
 *
 * Handles:
 * - Node information endpoint
 * - Heartbeat endpoint
 * - Health checks
 */
export class StatusController extends BaseController {
  private readonly container: Container;

  constructor(container: Container) {
    super('StatusController');
    this.container = container;
  }

  /**
   * GET /status/information
   *
   * Returns node information including video count and public settings
   */
  information = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const config = getConfig();

      const nodeSettings = config.nodeSettings;

      const videoRepository = this.container.resolve('videoRepository');

      const videoCount = await videoRepository.getCount({
        isPublished: true,
      });

      const information: StatusInformation = {
        nodeVideoCount: videoCount,
        nodeId: nodeSettings.nodeId,
        nodeName: nodeSettings.nodeName,
        nodeAbout: nodeSettings.nodeAbout,
        publicNodeProtocol: nodeSettings.publicNodeProtocol,
        publicNodeAddress: nodeSettings.publicNodeAddress,
        publicNodePort: String(nodeSettings.publicNodePort),
        cloudflareTurnstileSiteKey: nodeSettings.cloudflareTurnstileSiteKey,
      };

      return await this.sendSuccess(reply, { information });
    } catch (error) {
      this.logger.error('Status information retrieval failed', error);

      return await this.sendError(reply, 'error retrieving status information');
    }
  };

  /**
   * GET /status/heartbeat
   *
   * Returns current timestamp for health checks
   */
  heartbeat = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    return await this.sendSuccess(reply, { timestamp: Date.now() });
  };
}
