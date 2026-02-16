/**
 * Unit tests for SettingsController
 *
 * Tests node settings management endpoints including:
 * - Settings retrieval
 * - Avatar/banner management
 * - Network configuration
 * - Cloudflare CDN configuration
 * - Feature toggles
 * - Database import/export
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock all dependencies before imports
vi.mock('node:fs', () => ({
  rm: vi.fn(),
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 })),
    rm: vi.fn(),
  },
}));

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: {
      imagesDirectoryPath: '/data/images',
      certificatesDirectoryPath: '/data/certificates',
      videosDirectoryPath: '/data/media/videos',
    },
    nodeSettings: {
      isCloudflareCdnEnabled: false,
      isSecure: false,
      cloudflareEmailAddress: '',
      cloudflareZoneId: '',
      cloudflareGlobalApiKey: '',
      storageConfig: { storageMode: 'filesystem' },
    },
    getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://example.com'),
    updateNodeSettings: vi.fn(),
    isDockerEnvironment: false,
  })),
}));

vi.mock('@utils/index.js', () => ({
  isCloudflareCredentialsValid: vi.fn(),
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import type { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import { SettingsController } from '../../../src/controllers/settings.js';
import { getConfig } from '@config/index.js';
import { isCloudflareCredentialsValid } from '@utils/index.js';

describe('SettingsController', () => {
  // Mock services
  const mockSettingsService: Record<string, ReturnType<typeof vi.fn>> = {
    getNodeSettings: vi.fn(),
    getVersion: vi.fn(),
    getAvatarFilePath: vi.fn(),
    getBannerFilePath: vi.fn(),
    getIndexedVideos: vi.fn(),
    updateNodeName: vi.fn(),
    updateNodeAbout: vi.fn(),
    updateNodeId: vi.fn(),
    updateCredentials: vi.fn(),
    updateNetworkSettings: vi.fn(),
    updateCloudflareConfig: vi.fn(),
    clearCloudflareConfig: vi.fn(),
    updateDatabaseConfig: vi.fn(),
    updateStorageConfig: vi.fn(),
    exportAllData: vi.fn(),
    importDatabase: vi.fn(),
    markAllVideosAsNotIndexed: vi.fn(),
    isDockerEnvironment: vi.fn(),
  };

  const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
    getAllVideosData: vi.fn(),
  };

  const mockCloudflareService: Record<string, ReturnType<typeof vi.fn>> = {
    purgeNodeImages: vi.fn(),
    resetCdn: vi.fn(),
    setCdnConfiguration: vi.fn(),
    addCdnDnsRecord: vi.fn(),
    purgeEntireCacheWithCredentials: vi.fn(),
    purgeAllWatchPages: vi.fn(),
  };

  const mockWebSocketService: Record<string, ReturnType<typeof vi.fn>> = {
    broadcastToChat: vi.fn(),
  };

  let controller: SettingsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    type: Mock;
    header: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new SettingsController(
      mockSettingsService as any,
      mockVideosService as any,
      mockCloudflareService as any,
      mockWebSocketService as any
    );

    mockRequest = {
      body: {},
      query: {},
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    // Default mock implementations
    mockSettingsService.getNodeSettings.mockReturnValue({ nodeName: 'Test Node' });
    mockSettingsService.getVersion.mockReturnValue('1.0.0');
    mockSettingsService.getIndexedVideos.mockResolvedValue([]);
    mockSettingsService.isDockerEnvironment.mockReturnValue(false);
    mockVideosService.getAllVideosData.mockResolvedValue([]);
  });

  describe('constructor', () => {
    it('should create a SettingsController instance', () => {
      expect(controller).toBeInstanceOf(SettingsController);
    });
  });

  describe('getSettings', () => {
    it('should get all node settings', () => {
      mockSettingsService.getNodeSettings.mockReturnValue({
        nodeName: 'My Node',
        isSecure: false,
      });
      mockSettingsService.getVersion.mockReturnValue('2.0.0');

      controller.getSettings(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.getNodeSettings).toHaveBeenCalled();
      expect(mockSettingsService.getVersion).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        nodeSettings: {
          nodeName: 'My Node',
          isSecure: false,
          version: '2.0.0',
        },
      });
    });

    it('should return error on failure', () => {
      mockSettingsService.getNodeSettings.mockImplementation(() => {
        throw new Error('Service error');
      });

      controller.getSettings(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('getAvatar', () => {
    it('should attempt to return avatar file when exists', async () => {
      mockSettingsService.getAvatarFilePath.mockReturnValue('/data/images/avatar.png');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('image data'));

      await controller.getAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.getAvatarFilePath).toHaveBeenCalled();
      // sendFile will be called, and the file path is validated
    });

    it('should return 404 when avatar not found', async () => {
      mockSettingsService.getAvatarFilePath.mockReturnValue(null);

      await controller.getAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'avatar not found',
      });
    });

    it('should return 500 on service error', async () => {
      mockSettingsService.getAvatarFilePath.mockImplementation(() => {
        throw new Error('File system error');
      });

      await controller.getAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('getBanner', () => {
    it('should attempt to return banner file when exists', async () => {
      mockSettingsService.getBannerFilePath.mockReturnValue('/data/images/banner.png');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('banner data'));

      await controller.getBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.getBannerFilePath).toHaveBeenCalled();
      // sendFile will be called with the file path
    });

    it('should return 404 when banner not found', async () => {
      mockSettingsService.getBannerFilePath.mockReturnValue(null);

      await controller.getBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'banner not found',
      });
    });

    it('should return 500 on service error', async () => {
      mockSettingsService.getBannerFilePath.mockImplementation(() => {
        throw new Error('File system error');
      });

      await controller.getBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('personalizeNodeName', () => {
    it('should update node name', async () => {
      mockRequest.body = { nodeName: 'New Node Name' };
      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNodeName.mockResolvedValue(undefined);

      await controller.personalizeNodeName(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNodeName).toHaveBeenCalledWith('New Node Name', false);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update indexer when there are indexed videos', async () => {
      mockRequest.body = { nodeName: 'New Name' };
      mockSettingsService.getIndexedVideos.mockResolvedValue([{ videoId: 'abc123' }]);
      mockSettingsService.updateNodeName.mockResolvedValue(undefined);

      await controller.personalizeNodeName(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNodeName).toHaveBeenCalledWith('New Name', true);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { nodeName: 'Name' };
      mockSettingsService.updateNodeName.mockRejectedValue(new Error('Update failed'));

      await controller.personalizeNodeName(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('personalizeNodeAbout', () => {
    it('should update node about', async () => {
      mockRequest.body = { nodeAbout: 'About this node' };
      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNodeAbout.mockResolvedValue(undefined);

      await controller.personalizeNodeAbout(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNodeAbout).toHaveBeenCalledWith('About this node', false);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { nodeAbout: 'About' };
      mockSettingsService.updateNodeAbout.mockRejectedValue(new Error('Update failed'));

      await controller.personalizeNodeAbout(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('personalizeNodeId', () => {
    it('should update node ID', async () => {
      mockRequest.body = { nodeId: 'new-node-id' };
      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNodeId.mockResolvedValue(undefined);

      await controller.personalizeNodeId(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNodeId).toHaveBeenCalledWith('new-node-id', false);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { nodeId: 'new-node-id' };
      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNodeId.mockRejectedValue(new Error('Update failed'));

      await controller.personalizeNodeId(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'error communicating with the MoarTube node',
        })
      );
    });
  });

  describe('updateAccount', () => {
    it('should update account credentials', async () => {
      mockRequest.body = { username: 'newuser', password: 'newpass' };
      mockSettingsService.updateCredentials.mockResolvedValue(undefined);

      await controller.updateAccount(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateCredentials).toHaveBeenCalledWith('newuser', 'newpass');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { username: 'user', password: 'pass' };
      mockSettingsService.updateCredentials.mockRejectedValue(new Error('Credential error'));

      await controller.updateAccount(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('networkInternal', () => {
    it('should update internal network settings', async () => {
      mockRequest.body = { nodeListeningPort: 8080 };
      mockSettingsService.isDockerEnvironment.mockReturnValue(false);

      await controller.networkInternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      // The controller calls getConfig().updateNodeSettings - we just verify success response
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update network settings without triggering restart directly', async () => {
      mockRequest.body = { nodeListeningPort: 9090 };
      mockSettingsService.isDockerEnvironment.mockReturnValue(false);

      // Mock process.send to verify it gets called
      const originalSend = process.send;
      process.send = vi.fn();

      await controller.networkInternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(process.send).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should not call process.send when it is undefined', async () => {
      mockRequest.body = { nodeListeningPort: 7070 };
      mockSettingsService.isDockerEnvironment.mockReturnValue(false);

      // Ensure process.send is undefined
      const originalSend = process.send;
      process.send = undefined;

      await controller.networkInternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should return error when running in Docker', async () => {
      mockRequest.body = { nodeListeningPort: 8080 };
      mockSettingsService.isDockerEnvironment.mockReturnValue(true);

      await controller.networkInternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: expect.stringContaining('docker container'),
        })
      );
    });

    it('should return error on failure', async () => {
      mockRequest.body = { nodeListeningPort: 8080 };
      mockSettingsService.isDockerEnvironment.mockReturnValue(false);

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.networkInternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'error communicating with the MoarTube node',
        })
      );
    });
  });

  describe('networkExternal', () => {
    it('should update external network settings', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'mynode.example.com',
        publicNodePort: '443',
      };
      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);
      mockVideosService.getAllVideosData.mockResolvedValue([]);

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNetworkSettings).toHaveBeenCalledWith(
        'https',
        'mynode.example.com',
        '443',
        false
      );
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should skip manifest rewriting when storage mode is s3provider', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 's3node.example.com',
        publicNodePort: '443',
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: false,
          storageConfig: { storageMode: 's3provider' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://s3node.example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));

      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.updateNetworkSettings).toHaveBeenCalled();
      // Should NOT call getAllVideosData since we're not rewriting manifests
      expect(mockVideosService.getAllVideosData).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should rewrite manifests when storage mode is filesystem', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'newnode.example.com',
        publicNodePort: '443',
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: false,
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://newnode.example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));

      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);
      mockVideosService.getAllVideosData.mockResolvedValue([
        { videoId: 'vid1', outputs: { m3u8: ['720p', '1080p'] } },
      ]);

      // Mock fs for manifest existence and rewriting
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(fs.default.readFileSync).mockReturnValue(
        '#EXTM3U\nhttps://oldnode.example.com/external/videos/vid1/segment.ts'
      );

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockVideosService.getAllVideosData).toHaveBeenCalled();
      expect(fs.default.existsSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle videos with no m3u8 outputs', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'newnode.example.com',
        publicNodePort: '443',
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: false,
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://newnode.example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));

      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);
      mockVideosService.getAllVideosData.mockResolvedValue([
        { videoId: 'vid1', outputs: { m3u8: [] } }, // No m3u8 outputs
      ]);

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle manifest rewrite errors gracefully', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'newnode.example.com',
        publicNodePort: '443',
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: false,
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://newnode.example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));

      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);
      mockVideosService.getAllVideosData.mockResolvedValue([
        { videoId: 'vid1', outputs: { m3u8: ['720p'] } },
      ]);

      // Mock fs - existsSync returns true but readFileSync throws
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(fs.default.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should still succeed - errors in manifest rewriting are logged but not fatal
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should skip manifests that do not exist on disk', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'newnode.example.com',
        publicNodePort: '443',
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: false,
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://newnode.example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));

      mockSettingsService.getIndexedVideos.mockResolvedValue([]);
      mockSettingsService.updateNetworkSettings.mockResolvedValue(undefined);
      mockVideosService.getAllVideosData.mockResolvedValue([
        { videoId: 'vid1', outputs: { m3u8: ['720p'] } },
      ]);

      // Mock fs - existsSync returns false so no manifests are rewritten
      const fs = await import('node:fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should still succeed
      expect(mockReply.status).toHaveBeenCalledWith(200);
      // readFileSync should not be called since files don't exist
      expect(fs.default.readFileSync).not.toHaveBeenCalled();
    });

    it('should return error on failure', async () => {
      mockRequest.body = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'node.com',
        publicNodePort: '443',
      };
      mockSettingsService.updateNetworkSettings.mockRejectedValue(new Error('Network error'));

      await controller.networkExternal(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('cloudflareConfigure', () => {
    it('should configure Cloudflare CDN', async () => {
      mockRequest.body = {
        cloudflareEmailAddress: 'admin@example.com',
        cloudflareZoneId: 'zone123',
        cloudflareGlobalApiKey: 'apikey456',
      };
      vi.mocked(isCloudflareCredentialsValid).mockResolvedValue(true);
      mockCloudflareService.resetCdn.mockResolvedValue(undefined);
      mockCloudflareService.setCdnConfiguration.mockResolvedValue(undefined);
      mockCloudflareService.addCdnDnsRecord.mockResolvedValue(undefined);
      mockCloudflareService.purgeEntireCacheWithCredentials.mockResolvedValue(undefined);

      await controller.cloudflareConfigure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(isCloudflareCredentialsValid).toHaveBeenCalledWith(
        'admin@example.com',
        'zone123',
        'apikey456'
      );
      expect(mockSettingsService.updateCloudflareConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when credentials invalid', async () => {
      mockRequest.body = {
        cloudflareEmailAddress: 'bad@email.com',
        cloudflareZoneId: 'zone',
        cloudflareGlobalApiKey: 'key',
      };
      vi.mocked(isCloudflareCredentialsValid).mockResolvedValue(false);

      await controller.cloudflareConfigure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'could not validate the Cloudflare credentials',
        })
      );
    });
  });

  describe('cloudflareClear', () => {
    it('should clear Cloudflare configuration', async () => {
      mockCloudflareService.resetCdn.mockResolvedValue(undefined);
      mockCloudflareService.purgeEntireCacheWithCredentials.mockResolvedValue(undefined);

      await controller.cloudflareClear(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.clearCloudflareConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should reset CDN when Cloudflare CDN is enabled', async () => {
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: true,
          cloudflareEmailAddress: 'test@example.com',
          cloudflareZoneId: 'zone123',
          cloudflareGlobalApiKey: 'apikey123',
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));
      mockCloudflareService.resetCdn.mockResolvedValue(undefined);
      mockCloudflareService.purgeEntireCacheWithCredentials.mockResolvedValue(undefined);

      await controller.cloudflareClear(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCloudflareService.resetCdn).toHaveBeenCalledWith(
        'test@example.com',
        'zone123',
        'apikey123'
      );
      expect(mockCloudflareService.purgeEntireCacheWithCredentials).toHaveBeenCalled();
      expect(mockSettingsService.clearCloudflareConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockSettingsService.clearCloudflareConfig.mockImplementation(() => {
        throw new Error('Clear error');
      });

      await controller.cloudflareClear(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('feature toggles', () => {
    it('should toggle comments', async () => {
      mockRequest.body = { isEnabled: true };

      await controller.commentsToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when comments toggle fails', async () => {
      mockRequest.body = { isEnabled: true };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.commentsToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should toggle likes', async () => {
      mockRequest.body = { isEnabled: false };

      await controller.likesToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when likes toggle fails', async () => {
      mockRequest.body = { isEnabled: false };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.likesToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should toggle dislikes', async () => {
      mockRequest.body = { isEnabled: true };

      await controller.dislikesToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when dislikes toggle fails', async () => {
      mockRequest.body = { isEnabled: true };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.dislikesToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should toggle reports', async () => {
      mockRequest.body = { isEnabled: false };

      await controller.reportsToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when reports toggle fails', async () => {
      mockRequest.body = { isEnabled: false };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.reportsToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should toggle live chat', async () => {
      mockRequest.body = { isEnabled: true };

      await controller.liveChatToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when live chat toggle fails', async () => {
      mockRequest.body = { isEnabled: true };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.liveChatToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('databaseConfigToggle', () => {
    it('should update database configuration', async () => {
      mockRequest.body = {
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
      };
      mockSettingsService.updateDatabaseConfig.mockResolvedValue(undefined);

      await controller.databaseConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockSettingsService.updateDatabaseConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update database config without triggering restart directly', async () => {
      mockRequest.body = {
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
      };
      mockSettingsService.updateDatabaseConfig.mockResolvedValue(undefined);

      // Mock process.send to verify it gets called
      const originalSend = process.send;
      process.send = vi.fn();

      await controller.databaseConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(process.send).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should not call process.send when it is undefined for database config', async () => {
      mockRequest.body = {
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
      };
      mockSettingsService.updateDatabaseConfig.mockResolvedValue(undefined);

      // Ensure process.send is undefined
      const originalSend = process.send;
      process.send = undefined;

      await controller.databaseConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should return error when connection fails', async () => {
      mockRequest.body = {
        databaseConfig: {
          databaseDialect: 'postgres',
          postgresConfig: { host: 'invalid' },
        },
      };
      mockSettingsService.updateDatabaseConfig.mockRejectedValue(new Error('Connection failed'));

      await controller.databaseConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'could not connect to database with provided configuration',
        })
      );
    });
  });

  describe('storageConfigToggle', () => {
    it('should update storage configuration', async () => {
      mockRequest.body = {
        storageConfig: {
          storageMode: 'filesystem',
        },
      };

      await controller.storageConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockSettingsService.updateStorageConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update storage config without triggering restart directly', async () => {
      mockRequest.body = {
        storageConfig: {
          storageMode: 'filesystem',
        },
      };

      // Mock process.send to verify it gets called
      const originalSend = process.send;
      process.send = vi.fn();

      await controller.storageConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(process.send).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should not call process.send when it is undefined for storage config', async () => {
      mockRequest.body = {
        storageConfig: {
          storageMode: 'filesystem',
        },
      };

      // Ensure process.send is undefined
      const originalSend = process.send;
      process.send = undefined;

      await controller.storageConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should update Cloudflare CDN DNS when CDN is enabled', async () => {
      mockRequest.body = {
        storageConfig: {
          storageMode: 's3provider',
        },
      };

      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => ({
        paths: {
          imagesDirectoryPath: '/data/images',
          certificatesDirectoryPath: '/data/certificates',
          videosDirectoryPath: '/data/media/videos',
        },
        nodeSettings: {
          isCloudflareCdnEnabled: true,
          cloudflareEmailAddress: 'test@example.com',
          cloudflareZoneId: 'zone123',
          cloudflareGlobalApiKey: 'apikey123',
          storageConfig: { storageMode: 'filesystem' },
        },
        getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://example.com'),
        updateNodeSettings: vi.fn(),
        isDockerEnvironment: false,
      }));
      mockCloudflareService.addCdnDnsRecord.mockResolvedValue(undefined);
      mockCloudflareService.purgeEntireCacheWithCredentials.mockResolvedValue(undefined);

      await controller.storageConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCloudflareService.addCdnDnsRecord).toHaveBeenCalledWith(
        'test@example.com',
        'zone123',
        'apikey123',
        { storageMode: 's3provider' }
      );
      expect(mockCloudflareService.purgeEntireCacheWithCredentials).toHaveBeenCalledWith(
        'test@example.com',
        'zone123',
        'apikey123'
      );
      expect(mockSettingsService.updateStorageConfig).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = {
        storageConfig: {
          storageMode: 's3provider',
        },
      };
      mockSettingsService.updateStorageConfig.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await controller.storageConfigToggle(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('exportDatabase', () => {
    it('should export database', async () => {
      mockSettingsService.exportAllData.mockResolvedValue({
        videos: [{ videoId: 'vid1' }],
        comments: [],
        videoReports: [],
        commentReports: [],
        videoReportsArchives: [],
        commentReportsArchives: [],
        liveChatMessages: [],
        cryptoWalletAddresses: [],
        links: [],
      });

      await controller.exportDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.exportAllData).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: false,
          database: expect.any(Array),
        })
      );
    });

    it('should return error on export failure', async () => {
      mockSettingsService.exportAllData.mockRejectedValue(new Error('Export failed'));

      await controller.exportDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'error exporting database',
        })
      );
    });
  });

  describe('cloudflareTurnstileConfigure', () => {
    it('should configure Cloudflare Turnstile', async () => {
      mockRequest.body = {
        cloudflareTurnstileSiteKey: 'sitekey123',
        cloudflareTurnstileSecretKey: 'secret456',
      };
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);

      await controller.cloudflareTurnstileConfigure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockWebSocketService.broadcastToChat).toHaveBeenCalledWith('all', {
        eventName: 'cloudflare_turnstile_information',
        data: { cloudflareTurnstileSiteKey: 'sitekey123' },
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('cloudflareTurnstileClear', () => {
    it('should clear Cloudflare Turnstile', async () => {
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);

      await controller.cloudflareTurnstileClear(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockWebSocketService.broadcastToChat).toHaveBeenCalledWith('all', {
        eventName: 'cloudflare_turnstile_information',
        data: { cloudflareTurnstileSiteKey: '' },
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===============================
  // configureSecure tests
  // ===============================
  describe('configureSecure', () => {
    it('should disable HTTPS mode', async () => {
      mockRequest.query = { isSecure: false };

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when enabling HTTPS without key file', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Mock request.parts() to return empty iterator (no files)
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          // yield nothing - no files uploaded
        },
      };
      (mockRequest as any).parts = () => mockParts;

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'private key file is missing',
        })
      );
    });

    it('should return error when cert file is missing but key file exists', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Mock request.parts() to return only key file
      const mockKeyFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'cert file is missing',
        })
      );
    });

    it('should enable HTTPS mode with valid certificates', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Mock the multipart file uploads
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      
      // Mock fs.createWriteStream
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should enable HTTPS without triggering restart directly', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      // Mock process.send to verify it gets called
      const originalSend = process.send;
      process.send = vi.fn();

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(process.send).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should not call process.send when it is undefined for secure config', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      // Ensure process.send is undefined
      const originalSend = process.send;
      process.send = undefined;

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Wait for setImmediate callback to execute (covers the if (process.send) falsy branch)
      await new Promise(resolve => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);

      // Restore
      process.send = originalSend;
    });

    it('should handle CA files during HTTPS enable', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockCaFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
          yield { type: 'file', fieldname: 'caFiles', file: mockCaFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should skip non-file parts', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'field', fieldname: 'someField', value: 'someValue' };
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should skip file parts with unknown fieldname', async () => {
      mockRequest.query = { isSecure: true };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockKeyFile = { pipe: vi.fn() };
      const mockCertFile = { pipe: vi.fn() };
      const mockUnknownFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'unknownField', file: mockUnknownFile };
          yield { type: 'file', fieldname: 'keyFile', file: mockKeyFile };
          yield { type: 'file', fieldname: 'certFile', file: mockCertFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on exception', async () => {
      mockRequest.query = { isSecure: true };
      (mockRequest as any).parts = () => {
        throw new Error('Multipart error');
      };

      await controller.configureSecure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // ===============================
  // uploadAvatar tests
  // ===============================
  describe('uploadAvatar', () => {
    it('should upload avatar image', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'avatarFile', file: mockFile, mimetype: 'image/png' };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);
      mockCloudflareService.purgeNodeImages.mockResolvedValue(undefined);
      mockSettingsService.markAllVideosAsNotIndexed.mockResolvedValue(undefined);

      await controller.uploadAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should create images directory if not exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      
      const mockFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'iconFile', file: mockFile, mimetype: 'image/jpeg' };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);
      mockCloudflareService.purgeNodeImages.mockResolvedValue(undefined);
      mockSettingsService.markAllVideosAsNotIndexed.mockResolvedValue(undefined);

      await controller.uploadAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle cloudflare purge error gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'avatarFile', file: mockFile };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);
      mockCloudflareService.purgeNodeImages.mockRejectedValue(new Error('Purge failed'));
      mockSettingsService.markAllVideosAsNotIndexed.mockResolvedValue(undefined);

      await controller.uploadAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should still succeed
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on exception', async () => {
      (mockRequest as any).parts = () => {
        throw new Error('Upload error');
      };

      await controller.uploadAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should skip non-file parts and unknown file fieldnames', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          // Non-file part
          yield { type: 'field', fieldname: 'someField', value: 'someValue' };
          // Unknown file fieldname
          yield { type: 'file', fieldname: 'unknownField', file: { pipe: vi.fn() } };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      mockCloudflareService.purgeNodeImages.mockResolvedValue(undefined);
      mockSettingsService.markAllVideosAsNotIndexed.mockResolvedValue(undefined);

      await controller.uploadAvatar(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should still succeed - just no files processed
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  // ===============================
  // uploadBanner tests
  // ===============================
  describe('uploadBanner', () => {
    it('should upload banner image', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'bannerFile', file: mockFile, mimetype: 'image/png' };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);
      mockCloudflareService.purgeNodeImages.mockResolvedValue(undefined);

      await controller.uploadBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should create images directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      
      const mockFile = { pipe: vi.fn() };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'bannerFile', file: mockFile, mimetype: 'image/png' };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      vi.mocked(fs.createWriteStream).mockReturnValue({ on: vi.fn() } as any);
      mockCloudflareService.purgeNodeImages.mockResolvedValue(undefined);

      await controller.uploadBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when no file uploaded', async () => {
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          // No file parts
        },
      };
      (mockRequest as any).parts = () => mockParts;

      await controller.uploadBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should skip non-file parts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          // Non-file part should be skipped
          yield { type: 'field', fieldname: 'someField', value: 'someValue' };
        },
      };
      (mockRequest as any).parts = () => mockParts;

      await controller.uploadBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should fail because no banner file was found
      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return error on exception', async () => {
      (mockRequest as any).parts = () => {
        throw new Error('Upload error');
      };

      await controller.uploadBanner(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // ===============================
  // importDatabase tests
  // ===============================
  describe('importDatabase', () => {
    it('should import database', async () => {
      const mockBuffer = Buffer.from(JSON.stringify([{ table: 'videos', data: [] }]));
      const mockFile = { toBuffer: vi.fn().mockResolvedValue(mockBuffer) };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'databaseFile', toBuffer: mockFile.toBuffer };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      mockSettingsService.importDatabase.mockResolvedValue(undefined);

      await controller.importDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockSettingsService.importDatabase).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when no database file uploaded', async () => {
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          // No file parts
        },
      };
      (mockRequest as any).parts = () => mockParts;

      await controller.importDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should skip file parts with wrong fieldname', async () => {
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'wrongFieldname', toBuffer: vi.fn() };
        },
      };
      (mockRequest as any).parts = () => mockParts;

      await controller.importDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Should return error because databaseFile was not found
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          isError: true,
          message: 'database file is missing',
        })
      );
    });

    it('should return error on import failure', async () => {
      const mockBuffer = Buffer.from(JSON.stringify([]));
      const mockFile = { toBuffer: vi.fn().mockResolvedValue(mockBuffer) };
      const mockParts = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'file', fieldname: 'databaseFile', toBuffer: mockFile.toBuffer };
        },
      };
      (mockRequest as any).parts = () => mockParts;
      mockSettingsService.importDatabase.mockRejectedValue(new Error('Import failed'));

      await controller.importDatabase(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // ===============================
  // restartServer tests
  // ===============================
  describe('restartServer', () => {
    it('should trigger restart via process.send', async () => {
      const originalSend = process.send;
      process.send = vi.fn();

      await controller.restartServer(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      await new Promise((resolve) => setImmediate(resolve));

      expect(process.send).toHaveBeenCalledWith({ cmd: 'restart_server' });
      expect(mockReply.status).toHaveBeenCalledWith(200);

      process.send = originalSend;
    });

    it('should return success even when process.send is undefined', async () => {
      const originalSend = process.send;
      process.send = undefined;

      await controller.restartServer(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockReply.status).toHaveBeenCalledWith(200);

      process.send = originalSend;
    });
  });

  // ===============================
  // Additional error handling tests
  // ===============================
  describe('error handling', () => {
    it('should handle error in cloudflareTurnstileConfigure', async () => {
      mockRequest.body = {
        cloudflareTurnstileSiteKey: 'sitekey123',
        cloudflareTurnstileSecretKey: 'secret456',
      };
      mockCloudflareService.purgeAllWatchPages.mockRejectedValue(new Error('Purge failed'));

      await controller.cloudflareTurnstileConfigure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle error in cloudflareTurnstileClear', async () => {
      mockCloudflareService.purgeAllWatchPages.mockRejectedValue(new Error('Purge failed'));

      await controller.cloudflareTurnstileClear(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle error in cloudflareConfigure', async () => {
      mockRequest.body = {
        cloudflareEmailAddress: 'admin@example.com',
        cloudflareZoneId: 'zone123',
        cloudflareGlobalApiKey: 'apikey456',
      };
      vi.mocked(isCloudflareCredentialsValid).mockRejectedValue(new Error('Validation failed'));

      await controller.cloudflareConfigure(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});
