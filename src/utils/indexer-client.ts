/**
 * Indexer Client
 *
 * API client for communicating with the MoarTube Indexer service.
 * Handles video indexing, node identification, and network updates.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Logger } from './logger.js';

/**
 * Indexer API error
 */
export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

/**
 * Indexer client configuration
 */
export interface IndexerClientConfig {
  /** Base URL of the MoarTube indexer */
  indexerUrl: string;
  /** Optional logger */
  logger?: Logger;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Indexer API response
 */
export interface IndexerApiResponse<T = unknown> {
  isError: boolean;
  message?: string;
  data?: T;
}

/**
 * Node identification
 */
export interface NodeIdentification {
  moarTubeTokenProof: string;
}

/**
 * Video index data
 */
export interface VideoIndexData {
  videoId: string;
  title: string;
  tags: string;
  views: number;
  isStreaming: boolean;
  lengthSeconds: number;
  nodeIconPngBase64: string;
  nodeAvatarPngBase64: string;
  videoPreviewJpgBase64: string;
  moarTubeTokenProof: string;
}

/**
 * Indexer API Client
 *
 * Handles all communication with the MoarTube indexer service.
 */
export class IndexerClient {
  private readonly client: AxiosInstance;
  private readonly logger: Logger | undefined;

  constructor(config: IndexerClientConfig) {
    this.logger = config.logger;

    this.client = axios.create({
      baseURL: config.indexerUrl,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ============================================
  // Video Index Operations
  // ============================================

  /**
   * Add a video to the index
   * @param data - Video data to add
   */
  async addVideoToIndex(data: VideoIndexData): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>('/index/video/add', data);
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'addVideoToIndex');
    }
  }

  /**
   * Remove a video from the index
   * @param data - Video removal data
   */
  async removeVideoFromIndex(data: {
    videoId: string;
    moarTubeTokenProof: string;
  }): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>('/index/video/remove', data);
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'removeVideoFromIndex');
    }
  }

  /**
   * Update a video in the index
   * @param data - Video data to update
   */
  async updateVideoIndex(data: VideoIndexData): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>('/index/video/update', data);
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'updateVideoIndex');
    }
  }

  // ============================================
  // Node Personalization
  // ============================================

  /**
   * Update node name in the index
   * @param moarTubeTokenProof - Node token proof
   * @param nodeName - New node name
   */
  async updateNodeName(moarTubeTokenProof: string, nodeName: string): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>(
        '/index/node/personalize/nodeName',
        {
          nodeName,
          moarTubeTokenProof,
        }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'updateNodeName');
    }
  }

  /**
   * Update node about text in the index
   * @param moarTubeTokenProof - Node token proof
   * @param nodeAbout - New about text
   */
  async updateNodeAbout(
    moarTubeTokenProof: string,
    nodeAbout: string
  ): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>(
        '/index/node/personalize/nodeAbout',
        {
          nodeAbout,
          moarTubeTokenProof,
        }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'updateNodeAbout');
    }
  }

  /**
   * Update node ID in the index
   * @param moarTubeTokenProof - Node token proof
   * @param nodeId - New node ID
   */
  async updateNodeId(moarTubeTokenProof: string, nodeId: string): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>(
        '/index/node/personalize/nodeId',
        {
          nodeId,
          moarTubeTokenProof,
        }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'updateNodeId');
    }
  }

  // ============================================
  // Network Updates
  // ============================================

  /**
   * Update node external network configuration
   * @param moarTubeTokenProof - Node token proof
   * @param publicNodeProtocol - Protocol (http/https)
   * @param publicNodeAddress - Node address
   * @param publicNodePort - Node port
   */
  async updateNetworkConfiguration(
    moarTubeTokenProof: string,
    publicNodeProtocol: 'http' | 'https',
    publicNodeAddress: string,
    publicNodePort: string | number
  ): Promise<IndexerApiResponse> {
    try {
      const response = await this.client.post<IndexerApiResponse>('/index/node/network/update', {
        publicNodeProtocol,
        publicNodeAddress,
        publicNodePort,
        moarTubeTokenProof,
      });
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError, 'updateNetworkConfiguration');
    }
  }

  // ============================================
  // Node Identification
  // ============================================

  /**
   * Get initial node identification
   */
  async getNodeIdentification(): Promise<NodeIdentification> {
    try {
      const response = await this.client.get<NodeIdentification>('/node/identification');
      return response.data;
    } catch (error) {
      this.handleError(error as AxiosError, 'getNodeIdentification');
      throw new IndexerError('Failed to get node identification');
    }
  }

  /**
   * Refresh node identification
   * @param moarTubeTokenProof - Current token proof
   */
  async refreshNodeIdentification(moarTubeTokenProof: string): Promise<NodeIdentification> {
    try {
      const response = await this.client.get<NodeIdentification>('/node/identification/refresh', {
        params: { moarTubeTokenProof },
      });
      return response.data;
    } catch (error) {
      this.handleError(error as AxiosError, 'refreshNodeIdentification');
      throw new IndexerError('Failed to refresh node identification');
    }
  }

  /**
   * Perform node identification (get or refresh)
   * @param currentTokenProof - Current token proof (empty string for new identification)
   */
  async performNodeIdentification(currentTokenProof: string): Promise<NodeIdentification> {
    if (currentTokenProof === '') {
      this.logger?.info('Creating new node identification');
      return this.getNodeIdentification();
    } else {
      this.logger?.info('Refreshing node identification');
      return this.refreshNodeIdentification(currentTokenProof);
    }
  }

  // ============================================
  // Error Handling
  // ============================================

  /**
   * Handle Axios errors
   */
  private handleError(error: AxiosError, operation: string): IndexerApiResponse {
    const response = error.response;
    const statusCode = response?.status;
    const message = error.message;

    this.logger?.error(`Indexer ${operation} failed`, error, { statusCode });

    return {
      isError: true,
      message: `${operation} failed: ${message}`,
    };
  }
}

/**
 * Create an indexer client
 */
export function createIndexerClient(config: IndexerClientConfig): IndexerClient {
  return new IndexerClient(config);
}
