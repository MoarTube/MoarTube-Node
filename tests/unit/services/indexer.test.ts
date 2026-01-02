/**
 * Indexer Service Tests
 *
 * Tests for the IndexerService class that handles communication with
 * the MoarTube Indexer service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { IndexerService } from '@/services/indexer.js';
import type { Logger } from '@/utils/logger.js';
import type { VideoIndexData, RemoveFromIndexData } from '@/services/interfaces.js';

// Mock axios
vi.mock('axios');

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@config/index.js';

describe('IndexerService', () => {
  let service: IndexerService;
  let mockLogger: Logger;
  let mockConfig: ReturnType<typeof getConfig>;
  let mockHttpClient: Partial<AxiosInstance>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockConfig = {
      appConfig: {
        indexerConfig: {
          httpProtocol: 'https',
          host: 'indexer.moartube.com',
          port: 443,
        },
      },
      nodeIdentification: {
        moarTubeTokenProof: 'test-token-proof',
      },
      setNodeIdentification: vi.fn(),
    } as unknown as ReturnType<typeof getConfig>;

    vi.mocked(getConfig).mockReturnValue(mockConfig);

    mockHttpClient = {
      post: vi.fn(),
      get: vi.fn(),
    };

    vi.mocked(axios.create).mockReturnValue(mockHttpClient as AxiosInstance);

    service = new IndexerService(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an IndexerService instance', () => {
      expect(service).toBeInstanceOf(IndexerService);
    });

    it('should initialize HTTP client with correct base URL', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://indexer.moartube.com:443',
          timeout: 30000,
        })
      );
    });

    it('should handle different port configurations', () => {
      mockConfig.appConfig.indexerConfig.httpProtocol = 'http';
      mockConfig.appConfig.indexerConfig.host = 'localhost';
      mockConfig.appConfig.indexerConfig.port = 8080;

      vi.mocked(axios.create).mockClear();
      new IndexerService(mockLogger);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:8080',
        })
      );
    });
  });

  describe('addVideoToIndex', () => {
    it('should log intent to add video to index', () => {
      service.addVideoToIndex('video123');

      expect(mockLogger.info).toHaveBeenCalledWith('Adding video to index', { videoId: 'video123' });
    });
  });

  describe('submitVideoToIndex', () => {
    const mockVideoData: VideoIndexData = {
      videoId: 'video123',
      title: 'Test Video',
      description: 'Test Description',
    } as unknown as VideoIndexData;

    it('should submit video data and return success result', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        status: 200,
        data: { isError: false, message: 'Success' },
      });

      const result = await service.submitVideoToIndex(mockVideoData);

      expect(result).toEqual({
        isError: false,
        statusCode: 200,
        message: 'Success',
      });
      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/video/add', mockVideoData);
    });

    it('should return result without message if not provided', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        status: 200,
        data: { isError: false },
      });

      const result = await service.submitVideoToIndex(mockVideoData);

      expect(result).toEqual({
        isError: false,
        statusCode: 200,
      });
    });

    it('should handle 413 Request Entity Too Large error', async () => {
      const error = {
        response: {
          status: 413,
          data: { isError: true, message: 'Request too large' },
        },
      };
      vi.mocked(mockHttpClient.post!).mockRejectedValue(error);

      const result = await service.submitVideoToIndex(mockVideoData);

      expect(result.isError).toBe(true);
      expect(result.statusCode).toBe(413);
      expect(result.message).toContain('1MB limit');
      expect(mockLogger.warn).toHaveBeenCalledWith('Video index submission too large', {
        videoId: 'video123',
      });
    });

    it('should handle other errors and log them', async () => {
      const error = {
        response: {
          status: 500,
          data: { isError: true, message: 'Server error' },
        },
      };
      vi.mocked(mockHttpClient.post!).mockRejectedValue(error);

      const result = await service.submitVideoToIndex(mockVideoData);

      expect(result.isError).toBe(true);
      expect(result.statusCode).toBe(500);
      expect(result.message).toBe('Server error');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to submit video to index', error, {
        videoId: 'video123',
      });
    });

    it('should handle network errors without response', async () => {
      const error = new Error('Network error');
      vi.mocked(mockHttpClient.post!).mockRejectedValue(error);

      const result = await service.submitVideoToIndex(mockVideoData);

      expect(result.isError).toBe(true);
      expect(result.message).toBe('Network error');
      expect(result.statusCode).toBeUndefined();
    });
  });

  describe('removeVideoFromIndex', () => {
    const mockRemoveData: RemoveFromIndexData = {
      videoId: 'video123',
      moarTubeTokenProof: 'test-token-proof',
    } as RemoveFromIndexData;

    it('should remove video from index successfully', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.removeVideoFromIndex(mockRemoveData);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/video/remove', mockRemoveData);
      expect(mockLogger.info).toHaveBeenCalledWith('Video removed from index', { videoId: 'video123' });
    });

    it('should throw error when indexer returns error response', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: true, message: 'Video not found' },
      });

      await expect(service.removeVideoFromIndex(mockRemoveData)).rejects.toThrow('Video not found');
    });

    it('should throw default error when no message provided', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: true },
      });

      await expect(service.removeVideoFromIndex(mockRemoveData)).rejects.toThrow(
        'Failed to remove video from index'
      );
    });
  });

  describe('updateVideoIndex', () => {
    it('should update video in index', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.updateVideoIndex({ videoId: 'video123' });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/video/update', { videoId: 'video123' });
      expect(mockLogger.info).toHaveBeenCalledWith('Video index updated', { videoId: 'video123' });
    });
  });

  describe('updateNodeName', () => {
    it('should update node name in index', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.updateNodeName('New Node Name');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/node/personalize/nodeName', {
        nodeName: 'New Node Name',
        moarTubeTokenProof: 'test-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node name updated in index', { name: 'New Node Name' });
    });

    it('should throw error when node not identified', async () => {
      mockConfig.nodeIdentification = null;

      await expect(service.updateNodeName('New Name')).rejects.toThrow('Node not identified');
    });
  });

  describe('updateNodeAbout', () => {
    it('should update node about in index', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.updateNodeAbout('New about text');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/node/personalize/nodeAbout', {
        nodeAbout: 'New about text',
        moarTubeTokenProof: 'test-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node about updated in index');
    });

    it('should throw error when node not identified', async () => {
      mockConfig.nodeIdentification = null;

      await expect(service.updateNodeAbout('New about')).rejects.toThrow('Node not identified');
    });
  });

  describe('updateNodeId', () => {
    it('should update node ID in index', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.updateNodeId('new-node-id');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/node/personalize/nodeId', {
        nodeId: 'new-node-id',
        moarTubeTokenProof: 'test-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node ID updated in index', { nodeId: 'new-node-id' });
    });

    it('should throw error when node not identified', async () => {
      mockConfig.nodeIdentification = null;

      await expect(service.updateNodeId('new-id')).rejects.toThrow('Node not identified');
    });
  });

  describe('updateExternalNetwork', () => {
    it('should update network configuration in index', async () => {
      vi.mocked(mockHttpClient.post!).mockResolvedValue({
        data: { isError: false },
      });

      await service.updateExternalNetwork('https', 'example.com', '443');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/index/node/network/update', {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
        moarTubeTokenProof: 'test-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node network configuration updated in index');
    });

    it('should throw error when node not identified', async () => {
      mockConfig.nodeIdentification = null;

      await expect(service.updateExternalNetwork('https', 'example.com', '443')).rejects.toThrow(
        'Node not identified'
      );
    });
  });

  describe('checkHealth', () => {
    it('should return true when indexer is healthy', async () => {
      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        status: 200,
      });

      const result = await service.checkHealth();

      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/health', { timeout: 5000 });
    });

    it('should return false when health check fails', async () => {
      vi.mocked(mockHttpClient.get!).mockRejectedValue(new Error('Connection failed'));

      const result = await service.checkHealth();

      expect(result).toBe(false);
    });

    it('should return false when status is not 200', async () => {
      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        status: 503,
      });

      const result = await service.checkHealth();

      expect(result).toBe(false);
    });
  });

  describe('getNodeIdentification', () => {
    it('should get node identification from indexer', async () => {
      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        data: { moarTubeTokenProof: 'new-token-proof' },
      });

      const result = await service.getNodeIdentification();

      expect(result).toEqual({ moarTubeTokenProof: 'new-token-proof' });
      expect(mockHttpClient.get).toHaveBeenCalledWith('/node/identification');
    });
  });

  describe('refreshNodeIdentification', () => {
    it('should refresh node identification', async () => {
      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        data: { moarTubeTokenProof: 'refreshed-token-proof' },
      });

      const result = await service.refreshNodeIdentification('old-token-proof');

      expect(result).toEqual({ moarTubeTokenProof: 'refreshed-token-proof' });
      expect(mockHttpClient.get).toHaveBeenCalledWith('/node/identification/refresh', {
        params: { moarTubeTokenProof: 'old-token-proof' },
      });
    });
  });

  describe('performNodeIdentification', () => {
    it('should create new identification when node is unidentified', async () => {
      mockConfig.nodeIdentification = null;

      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        data: { moarTubeTokenProof: 'new-token-proof' },
      });

      await service.performNodeIdentification();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/node/identification');
      expect(mockConfig.setNodeIdentification).toHaveBeenCalledWith({
        moarTubeTokenProof: 'new-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node is unidentified, creating node identification');
      expect(mockLogger.info).toHaveBeenCalledWith('Node identification successful');
    });

    it('should refresh existing identification', async () => {
      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        data: { moarTubeTokenProof: 'refreshed-token-proof' },
      });

      await service.performNodeIdentification();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/node/identification/refresh', {
        params: { moarTubeTokenProof: 'test-token-proof' },
      });
      expect(mockConfig.setNodeIdentification).toHaveBeenCalledWith({
        moarTubeTokenProof: 'refreshed-token-proof',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node identification found, refreshing');
    });

    it('should create new identification when existing token is empty', async () => {
      mockConfig.nodeIdentification = { moarTubeTokenProof: '' };

      vi.mocked(mockHttpClient.get!).mockResolvedValue({
        data: { moarTubeTokenProof: 'new-token-proof' },
      });

      await service.performNodeIdentification();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/node/identification');
    });
  });
});
