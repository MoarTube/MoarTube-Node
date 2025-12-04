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

interface HealthCheck {
  status: 'ok' | 'error';
  message?: string;
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
  information = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const config = getConfig();
    const nodeSettings = config.nodeSettings;

    // Get video count from repository
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

    this.sendSuccess(reply, { information });
  };

  /**
   * GET /status/heartbeat
   *
   * Returns current timestamp for health checks
   */
  heartbeat = (_request: FastifyRequest, reply: FastifyReply): void => {
    this.sendSuccess(reply, { timestamp: Date.now() });
  };

  /**
   * GET /health
   *
   * Basic liveness check
   */
  health = (_request: FastifyRequest, reply: FastifyReply): void => {
    void reply.send({ status: 'ok', timestamp: Date.now() });
  };

  /**
   * GET /health/ready
   *
   * Detailed readiness check including database connectivity
   */
  healthReady = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    let databaseCheck: HealthCheck = { status: 'ok' };
    let configurationCheck: HealthCheck = { status: 'ok' };

    // Check database connectivity
    try {
      const videoRepository = this.container.resolve('videoRepository');
      await videoRepository.getCount({});
    } catch (error) {
      databaseCheck = {
        status: 'error',
        message: (error as Error).message,
      };
    }

    // Check configuration
    try {
      const config = getConfig();
      const nodeId = config.nodeSettings.nodeId;
      if (nodeId === '') {
        configurationCheck = {
          status: 'error',
          message: 'Node not configured',
        };
      }
    } catch (error) {
      configurationCheck = {
        status: 'error',
        message: (error as Error).message,
      };
    }

    const isHealthy = databaseCheck.status === 'ok' && configurationCheck.status === 'ok';
    const httpStatus = isHealthy ? 200 : 503;

    void reply.status(httpStatus).send({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: Date.now(),
      checks: {
        database: databaseCheck,
        configuration: configurationCheck,
      },
    });
  };
}
