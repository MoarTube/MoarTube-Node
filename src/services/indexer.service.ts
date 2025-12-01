/**
 * Indexer Service
 *
 * Service layer for communication with the MoarTube Indexer service.
 * Handles video indexing, node identification, and network updates.
 */
import axios, { type AxiosInstance } from 'axios';

import { BaseService, type ServiceOptions } from './base.service';
import type { IIndexerService } from './interfaces';
import { getConfig } from '../config';

/**
 * Indexer response structure
 */
interface IndexerResponse {
  isError: boolean;
  message?: string;
  moarTubeTokenProof?: string;
}

/**
 * Video index data for submission
 */
export interface VideoIndexData {
  videoId: string;
  nodeId: string;
  nodeName: string;
  nodeAbout: string;
  publicNodeProtocol: string;
  publicNodeAddress: string;
  publicNodePort: string | number;
  title: string;
  tags: string;
  views: number;
  isLive: boolean;
  isStreaming: boolean;
  lengthSeconds: number;
  creationTimestamp: number;
  containsAdultContent: boolean;
  nodeIconPngBase64: string;
  nodeAvatarPngBase64: string;
  videoPreviewJpgBase64: string;
  moarTubeTokenProof: string;
  cloudflareTurnstileToken: string;
}

/**
 * IndexerService class
 *
 * Handles all communication with the MoarTube Indexer:
 * - Adding/removing videos from the index
 * - Node identification and authentication
 * - Node personalization updates
 * - Network configuration updates
 */
export class IndexerService extends BaseService implements IIndexerService {
  private readonly httpClient: AxiosInstance;
  private readonly indexerUrl: string;

  constructor(options?: ServiceOptions) {
    super('IndexerService', options);

    const config = getConfig();
    const indexerConfig = config.appConfig.indexerConfig;
    this.indexerUrl = `${indexerConfig.httpProtocol}://${indexerConfig.host}:${indexerConfig.port}`;

    this.httpClient = axios.create({
      baseURL: this.indexerUrl,
      timeout: 30000,
    });
  }

  /**
   * Add a video to the index
   */
  addVideoToIndex(videoId: string): void {
    // This is a simplified version - full implementation would gather all video data
    // and call the indexer API
    this.logger.info('Adding video to index', { videoId });

    // The actual implementation would gather video data, node info, images, etc.
    // and submit to indexer. For now, we just log the intent.
    // Full implementation requires integration with VideoService to get data.
  }

  /**
   * Submit full video data to index
   */
  async submitVideoToIndex(data: VideoIndexData): Promise<IndexerResponse> {
    return this.withErrorLogging('submitVideoToIndex', async () => {
      const response = await this.httpClient.post<IndexerResponse>('/index/video/add', data);
      return response.data;
    });
  }

  /**
   * Remove a video from the index
   */
  async removeVideoFromIndex(videoId: string): Promise<void> {
    return this.withErrorLogging('removeVideoFromIndex', async () => {
      const config = getConfig();
      const nodeIdentification = config.nodeIdentification;

      if (!nodeIdentification) {
        throw new Error('Node not identified - cannot remove from index');
      }

      const data = {
        videoId,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
      };

      await this.httpClient.post('/index/video/remove', data);
      this.logger.info('Video removed from index', { videoId });
    });
  }

  /**
   * Update video data in the index
   */
  async updateVideoIndex(data: Partial<VideoIndexData>): Promise<void> {
    return this.withErrorLogging('updateVideoIndex', async () => {
      await this.httpClient.post('/index/video/update', data);
      this.logger.info('Video index updated', { videoId: data.videoId });
    });
  }

  /**
   * Update node personalization (name)
   */
  async updateNodeName(name: string): Promise<void> {
    return this.withErrorLogging('updateNodeName', async () => {
      const config = getConfig();
      const nodeIdentification = config.nodeIdentification;

      if (!nodeIdentification) {
        throw new Error('Node not identified');
      }

      const data = {
        nodeName: name,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
      };

      await this.httpClient.post('/index/node/personalize/nodeName', data);
      this.logger.info('Node name updated in index', { name });
    });
  }

  /**
   * Update node personalization (about)
   */
  async updateNodeAbout(about: string): Promise<void> {
    return this.withErrorLogging('updateNodeAbout', async () => {
      const config = getConfig();
      const nodeIdentification = config.nodeIdentification;

      if (!nodeIdentification) {
        throw new Error('Node not identified');
      }

      const data = {
        nodeAbout: about,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
      };

      await this.httpClient.post('/index/node/personalize/nodeAbout', data);
      this.logger.info('Node about updated in index');
    });
  }

  /**
   * Update node personalization (ID)
   */
  async updateNodeId(nodeId: string): Promise<void> {
    return this.withErrorLogging('updateNodeId', async () => {
      const config = getConfig();
      const nodeIdentification = config.nodeIdentification;

      if (!nodeIdentification) {
        throw new Error('Node not identified');
      }

      const data = {
        nodeId,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
      };

      await this.httpClient.post('/index/node/personalize/nodeId', data);
      this.logger.info('Node ID updated in index', { nodeId });
    });
  }

  /**
   * Update external network configuration
   */
  async updateExternalNetwork(): Promise<void> {
    return this.withErrorLogging('updateExternalNetwork', async () => {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;
      const nodeIdentification = config.nodeIdentification;

      if (!nodeIdentification) {
        throw new Error('Node not identified');
      }

      const data = {
        publicNodeProtocol: nodeSettings.publicNodeProtocol,
        publicNodeAddress: nodeSettings.publicNodeAddress,
        publicNodePort: nodeSettings.publicNodePort,
        moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
      };

      await this.httpClient.post('/index/node/network/update', data);
      this.logger.info('Node network configuration updated in index');
    });
  }

  /**
   * Check indexer health/connectivity
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get node identification from indexer
   */
  async getNodeIdentification(): Promise<{ moarTubeTokenProof: string }> {
    return this.withErrorLogging('getNodeIdentification', async () => {
      const response = await this.httpClient.get<{ moarTubeTokenProof: string }>(
        '/node/identification'
      );
      return response.data;
    });
  }

  /**
   * Refresh node identification
   */
  async refreshNodeIdentification(
    moarTubeTokenProof: string
  ): Promise<{ moarTubeTokenProof: string }> {
    return this.withErrorLogging('refreshNodeIdentification', async () => {
      const response = await this.httpClient.get<{ moarTubeTokenProof: string }>(
        '/node/identification/refresh',
        {
          params: { moarTubeTokenProof },
        }
      );
      return response.data;
    });
  }

  /**
   * Perform full node identification flow
   *
   * Gets or refreshes node identification with the MoarTube indexer
   */
  async performNodeIdentification(): Promise<void> {
    return this.withErrorLogging('performNodeIdentification', async () => {
      this.logger.info('Validating node to MoarTube network');

      const config = getConfig();
      const existingIdentification = config.nodeIdentification;

      // Create a mutable copy
      const nodeIdentification: { moarTubeTokenProof: string } = existingIdentification
        ? { moarTubeTokenProof: existingIdentification.moarTubeTokenProof }
        : { moarTubeTokenProof: '' };

      if (nodeIdentification.moarTubeTokenProof === '') {
        // Node is unidentified - get new identification
        this.logger.info('Node is unidentified, creating node identification');
        const result = await this.getNodeIdentification();
        nodeIdentification.moarTubeTokenProof = result.moarTubeTokenProof;
      } else {
        // Refresh existing identification
        this.logger.info('Node identification found, refreshing');
        const result = await this.refreshNodeIdentification(nodeIdentification.moarTubeTokenProof);
        nodeIdentification.moarTubeTokenProof = result.moarTubeTokenProof;
      }

      // Persist updated identification
      config.setNodeIdentification(nodeIdentification);

      this.logger.info('Node identification successful');
    });
  }
}
