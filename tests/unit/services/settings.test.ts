/**
 * Settings Service Tests
 *
 * Tests for the SettingsService class that handles node configuration management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '@/services/settings.js';
import type { Logger } from '@/utils/logger.js';
import type {
  VideosRepository,
  CommentsRepository,
  ReportsVideosRepository,
  ReportsCommentsRepository,
  ReportsArchiveVideosRepository,
  ReportsArchiveCommentsRepository,
  LiveChatMessagesRepository,
  MonetizationRepository,
  ILinksRepository,
} from '@/database/repositories/index.js';
import type { CloudflareService } from '@/services/cloudflare.js';
import type { IndexerService } from '@/services/indexer.js';

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock better-sqlite3 for database config tests
const mockDbPrepare = vi.fn().mockReturnValue({ get: vi.fn() });
const mockDbClose = vi.fn();
vi.mock('better-sqlite3', () => {
  // Create a mock constructor function
  function MockDatabase() {
    return {
      prepare: mockDbPrepare,
      close: mockDbClose,
    };
  }
  return { default: MockDatabase };
});

// Mock postgres for database config tests
const mockSqlEnd = vi.fn().mockResolvedValue(undefined);
vi.mock('postgres', () => ({
  default: vi.fn().mockImplementation(() => {
    const sql = async () => Promise.resolve([{ '?column?': 1 }]);
    (sql as unknown as { end: typeof mockSqlEnd }).end = mockSqlEnd;
    return sql;
  }),
}));

import { getConfig } from '@config/index.js';
import fs from 'node:fs';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockLogger: Logger;
  let mockVideosRepository: VideosRepository;
  let mockCommentsRepository: CommentsRepository;
  let mockReportsVideosRepository: ReportsVideosRepository;
  let mockReportsCommentsRepository: ReportsCommentsRepository;
  let mockReportsArchiveVideosRepository: ReportsArchiveVideosRepository;
  let mockReportsArchiveCommentsRepository: ReportsArchiveCommentsRepository;
  let mockLiveChatMessagesRepository: LiveChatMessagesRepository;
  let mockMonetizationRepository: MonetizationRepository;
  let mockLinksRepository: ILinksRepository;
  let mockIndexerService: IndexerService;
  let mockCloudflareService: CloudflareService;
  let mockConfig: ReturnType<typeof getConfig>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockVideosRepository = {} as VideosRepository;
    mockCommentsRepository = {} as CommentsRepository;
    mockReportsVideosRepository = {} as ReportsVideosRepository;
    mockReportsCommentsRepository = {} as ReportsCommentsRepository;
    mockReportsArchiveVideosRepository = {} as ReportsArchiveVideosRepository;
    mockReportsArchiveCommentsRepository = {} as ReportsArchiveCommentsRepository;
    mockLiveChatMessagesRepository = {} as LiveChatMessagesRepository;
    mockMonetizationRepository = {} as MonetizationRepository;
    mockLinksRepository = {} as ILinksRepository;

    mockIndexerService = {
      performNodeIdentification: vi.fn(),
      updateNodeName: vi.fn(),
      updateNodeAbout: vi.fn(),
      updateNodeId: vi.fn(),
      updateExternalNetwork: vi.fn(),
    } as unknown as IndexerService;

    mockCloudflareService = {
      isEnabled: vi.fn().mockReturnValue(false),
      purgeNodePage: vi.fn(),
    } as unknown as CloudflareService;

    mockConfig = {
      nodeSettings: {
        nodeName: 'Test Node',
        nodeAbout: 'About text',
        nodeId: 'node123',
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
      },
      updateNodeSettings: vi.fn(),
      paths: {
        databaseFilePath: '/data/db.sqlite',
      },
    } as unknown as ReturnType<typeof getConfig>;

    vi.mocked(getConfig).mockReturnValue(mockConfig);

    service = new SettingsService(
      mockLogger,
      mockVideosRepository,
      mockCommentsRepository,
      mockReportsVideosRepository,
      mockReportsCommentsRepository,
      mockReportsArchiveVideosRepository,
      mockReportsArchiveCommentsRepository,
      mockLiveChatMessagesRepository,
      mockMonetizationRepository,
      mockLinksRepository,
      mockIndexerService,
      mockCloudflareService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a SettingsService instance', () => {
      expect(service).toBeInstanceOf(SettingsService);
    });
  });

  describe('getNodeSettings', () => {
    it('should return node settings from config', () => {
      const result = service.getNodeSettings();

      expect(result).toEqual(mockConfig.nodeSettings);
    });
  });

  describe('getVersion', () => {
    it('should return version from package.json', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.2.3' }));

      const result = service.getVersion();

      expect(result).toBe('1.2.3');
    });

    it('should return 0.0.0 if no version in package.json', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = service.getVersion();

      expect(result).toBe('0.0.0');
    });

    it('should return 0.0.0 on error', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = service.getVersion();

      expect(result).toBe('0.0.0');
    });
  });

  describe('updateNodeSettings', () => {
    it('should update node settings', () => {
      service.updateNodeSettings({
        nodeName: 'New Name',
        nodeAbout: 'New about',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        nodeName: 'New Name',
        nodeAbout: 'New about',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Node settings updated', {
        fields: ['nodeName', 'nodeAbout'],
      });
    });

    it('should only update provided fields', () => {
      service.updateNodeSettings({
        nodeName: 'New Name',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        nodeName: 'New Name',
      });
    });

    it('should handle updates without nodeName', () => {
      service.updateNodeSettings({
        nodeAbout: 'About only',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        nodeAbout: 'About only',
      });
    });

    it('should handle all supported fields', () => {
      service.updateNodeSettings({
        nodeName: 'Name',
        nodeAbout: 'About',
        nodeId: 'id123',
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
        isSecure: true,
        isReportsEnabled: true,
        isCloudflareTurnstileEnabled: true,
        cloudflareTurnstileSiteKey: 'site-key',
        cloudflareTurnstileSecretKey: 'secret-key',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalled();
    });
  });

  describe('updateNodeName', () => {
    it('should update node name locally', async () => {
      await service.updateNodeName('New Node Name');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({ nodeName: 'New Node Name' });
      expect(mockLogger.info).toHaveBeenCalledWith('Node name updated', { name: 'New Node Name' });
    });

    it('should update indexer when hasIndexedVideos is true', async () => {
      await service.updateNodeName('New Node Name', true);

      expect(mockIndexerService.performNodeIdentification).toHaveBeenCalled();
      expect(mockIndexerService.updateNodeName).toHaveBeenCalledWith('New Node Name');
    });

    it('should purge Cloudflare cache when enabled and hasIndexedVideos', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);

      await service.updateNodeName('New Node Name', true);

      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
    });

    it('should not purge Cloudflare cache when disabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(false);

      await service.updateNodeName('New Node Name', true);

      expect(mockCloudflareService.purgeNodePage).not.toHaveBeenCalled();
    });

    it('should log error and throw on indexer failure', async () => {
      const error = new Error('Indexer failed');
      vi.mocked(mockIndexerService.performNodeIdentification).mockRejectedValue(error);

      await expect(service.updateNodeName('New Name', true)).rejects.toThrow('Indexer failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update node name in indexer', error);
    });
  });

  describe('updateNodeAbout', () => {
    it('should update node about locally', async () => {
      await service.updateNodeAbout('New about text');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({ nodeAbout: 'New about text' });
      expect(mockLogger.info).toHaveBeenCalledWith('Node about updated');
    });

    it('should update indexer when hasIndexedVideos is true', async () => {
      await service.updateNodeAbout('New about text', true);

      expect(mockIndexerService.performNodeIdentification).toHaveBeenCalled();
      expect(mockIndexerService.updateNodeAbout).toHaveBeenCalledWith('New about text');
    });

    it('should log error and throw on indexer failure', async () => {
      const error = new Error('Indexer failed');
      vi.mocked(mockIndexerService.updateNodeAbout).mockRejectedValue(error);

      await expect(service.updateNodeAbout('New about', true)).rejects.toThrow('Indexer failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update node about in indexer', error);
    });

    it('should purge Cloudflare cache when enabled and hasIndexedVideos', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);

      await service.updateNodeAbout('New about text', true);

      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
    });
  });

  describe('updateNodeId', () => {
    it('should update node ID locally when no indexed videos', async () => {
      await service.updateNodeId('new-node-id');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({ nodeId: 'new-node-id' });
      expect(mockLogger.info).toHaveBeenCalledWith('Node ID updated', { nodeId: 'new-node-id' });
    });

    it('should update indexer when hasIndexedVideos is true', async () => {
      await service.updateNodeId('new-node-id', true);

      expect(mockIndexerService.performNodeIdentification).toHaveBeenCalled();
      expect(mockIndexerService.updateNodeId).toHaveBeenCalledWith('new-node-id');
    });

    it('should log error and throw on indexer failure', async () => {
      const error = new Error('Indexer failed');
      vi.mocked(mockIndexerService.updateNodeId).mockRejectedValue(error);

      await expect(service.updateNodeId('new-id', true)).rejects.toThrow('Indexer failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update node ID in indexer', error);
    });

    it('should purge Cloudflare cache when enabled and hasIndexedVideos', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);

      await service.updateNodeId('new-node-id', true);

      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
    });
  });

  describe('updateNetworkSettings', () => {
    it('should update network settings locally', async () => {
      await service.updateNetworkSettings('https', 'example.com', '443');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Network settings updated', {
        protocol: 'https',
        address: 'example.com',
        port: '443',
      });
    });

    it('should update indexer when hasIndexedVideos is true', async () => {
      await service.updateNetworkSettings('https', 'example.com', '443', true);

      expect(mockIndexerService.performNodeIdentification).toHaveBeenCalled();
      expect(mockIndexerService.updateExternalNetwork).toHaveBeenCalledWith(
        'https',
        'example.com',
        '443'
      );
    });

    it('should log error and throw on indexer failure', async () => {
      const error = new Error('Indexer failed');
      vi.mocked(mockIndexerService.updateExternalNetwork).mockRejectedValue(error);

      await expect(
        service.updateNetworkSettings('https', 'example.com', '443', true)
      ).rejects.toThrow('Indexer failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update network in indexer', error);
    });
  });

  describe('updateCredentials', () => {
    it('should hash and update credentials', async () => {
      await service.updateCredentials('newuser', 'newpass');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        username: expect.any(String),
        password: expect.any(String),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Credentials updated');
    });

    it('should encode credentials as base64', async () => {
      await service.updateCredentials('testuser', 'testpass');

      const call = vi.mocked(mockConfig.updateNodeSettings).mock.calls[0][0];
      // Should be URL-encoded base64 strings
      expect(typeof call.username).toBe('string');
      expect(typeof call.password).toBe('string');
    });
  });

  describe('updateDatabaseConfig', () => {
    it('should test SQLite connection and update config', async () => {
      await service.updateDatabaseConfig({
        databaseDialect: 'sqlite',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        databaseConfig: { databaseDialect: 'sqlite' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Database configuration updated', {
        databaseConfig: { databaseDialect: 'sqlite' },
      });
    });

    it('should throw error when postgres config is missing', async () => {
      await expect(
        service.updateDatabaseConfig({
          databaseDialect: 'postgres',
        })
      ).rejects.toThrow('postgres configuration is required');
    });

    it('should test PostgreSQL connection and update config', async () => {
      const postgresConfig = {
        databaseDialect: 'postgres' as const,
        postgresConfig: {
          host: 'localhost',
          port: 5432,
          databaseName: 'testdb',
          username: 'user',
          password: 'pass',
        },
      };

      await service.updateDatabaseConfig(postgresConfig);

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        databaseConfig: postgresConfig,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Database configuration updated', {
        databaseConfig: postgresConfig,
      });
    });
  });

  describe('updateStorageConfig', () => {
    it('should update filesystem storage mode', () => {
      service.updateStorageConfig({
        storageMode: 'filesystem',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        storageConfig: {
          storageMode: 'filesystem',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Storage configuration updated', { mode: 'filesystem' });
    });

    it('should update S3 storage mode with config', () => {
      service.updateStorageConfig({
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'my-bucket',
          s3ProviderClientConfig: {
            forcePathStyle: true,
            region: 'us-west-2',
            credentials: {
              accessKeyId: 'access-key',
              secretAccessKey: 'secret-key',
            },
          },
        },
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        storageConfig: expect.objectContaining({
          storageMode: 's3provider',
          s3Config: expect.objectContaining({
            bucketName: 'my-bucket',
          }),
        }),
      });
    });

    it('should include custom S3 endpoint', () => {
      service.updateStorageConfig({
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'my-bucket',
          s3ProviderClientConfig: {
            forcePathStyle: true,
            region: 'auto',
            credentials: {
              accessKeyId: 'access-key',
              secretAccessKey: 'secret-key',
            },
            endpoint: 'https://minio.example.com',
          },
        },
      });

      const call = vi.mocked(mockConfig.updateNodeSettings).mock.calls[0][0];
      expect(call.storageConfig.s3Config.s3ProviderClientConfig.endpoint).toBe('https://minio.example.com');
    });

    it('should ignore s3 settings when storageMode is filesystem', () => {
      service.updateStorageConfig({
        storageMode: 'filesystem',
      });

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        storageConfig: {
          storageMode: 'filesystem',
        },
      });
    });
  });

  describe('updateCloudflareConfig', () => {
    it('should update Cloudflare configuration', () => {
      service.updateCloudflareConfig('email@example.com', 'zone123', 'api-key');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        isCloudflareCdnEnabled: true,
        cloudflareEmailAddress: 'email@example.com',
        cloudflareZoneId: 'zone123',
        cloudflareGlobalApiKey: 'api-key',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Cloudflare configuration updated');
    });
  });

  describe('clearCloudflareConfig', () => {
    it('should clear Cloudflare configuration', () => {
      service.clearCloudflareConfig();

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({
        isCloudflareCdnEnabled: false,
        cloudflareEmailAddress: '',
        cloudflareGlobalApiKey: '',
        cloudflareZoneId: '',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Cloudflare configuration cleared');
    });
  });

  describe('getAvatarFilePath', () => {
    it('should return custom avatar path when exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };

      const result = service.getAvatarFilePath();

      expect(result).toContain('avatar.png');
    });

    it('should return null when no avatar exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };

      const result = service.getAvatarFilePath();

      expect(result).toBeNull();
    });

    it('should return null on error', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = service.getAvatarFilePath();

      expect(result).toBeNull();
    });
  });

  describe('getBannerFilePath', () => {
    it('should return custom banner path when exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };

      const result = service.getBannerFilePath();

      expect(result).toContain('banner.png');
    });

    it('should return null when no banner exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };

      const result = service.getBannerFilePath();

      expect(result).toBeNull();
    });

    it('should return null on error', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = service.getBannerFilePath();

      expect(result).toBeNull();
    });
  });

  describe('updateAvatar', () => {
    beforeEach(() => {
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should copy icon and avatar files', async () => {
      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateAvatar('/tmp/icon.png', '/tmp/avatar.png');

      expect(fsMock.default.copyFileSync).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Avatar updated');
    });

    it('should purge Cloudflare cache when enabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);
      (mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }).purgeNodeImages = vi.fn();

      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateAvatar('/tmp/icon.png', '/tmp/avatar.png');

      expect((mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }).purgeNodeImages).toHaveBeenCalled();
    });

    it('should create images directory if it does not exist', async () => {
      const fsMock = await import('node:fs');
      let callCount = 0;
      vi.mocked(fsMock.default.existsSync).mockImplementation(() => {
        callCount++;
        // First call is for imagesDir check, return false to trigger mkdirSync
        if (callCount === 1) return false;
        // Subsequent calls are for file existence checks
        return true;
      });
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateAvatar('/tmp/icon.png', '/tmp/avatar.png');

      expect(fsMock.default.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('images'), { recursive: true });
    });

    it('should handle non-existent icon or avatar files gracefully', async () => {
      const fsMock = await import('node:fs');
      vi.mocked(fsMock.default.existsSync).mockReturnValue(false);
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateAvatar('/tmp/icon.png', '/tmp/avatar.png');

      expect(fsMock.default.copyFileSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Avatar updated');
    });
  });

  describe('updateBanner', () => {
    beforeEach(() => {
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should copy banner file', async () => {
      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateBanner('/tmp/banner.png');

      expect(fsMock.default.copyFileSync).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Banner updated');
    });

    it('should create images directory if it does not exist', async () => {
      const fsMock = await import('node:fs');
      let callCount = 0;
      vi.mocked(fsMock.default.existsSync).mockImplementation(() => {
        callCount++;
        // First call is for imagesDir check, return false to trigger mkdirSync
        if (callCount === 1) return false;
        // Subsequent calls are for file existence checks
        return true;
      });
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateBanner('/tmp/banner.png');

      expect(fsMock.default.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('images'), { recursive: true });
    });

    it('should purge Cloudflare cache when enabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);
      (mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }).purgeNodeImages = vi.fn();

      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateBanner('/tmp/banner.png');

      expect((mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }).purgeNodeImages).toHaveBeenCalled();
    });

    it('should handle non-existent banner file gracefully', async () => {
      const fsMock = await import('node:fs');
      vi.mocked(fsMock.default.existsSync).mockReturnValue(false);
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateBanner('/tmp/banner.png');

      expect(fsMock.default.copyFileSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Banner updated');
    });
  });

  describe('performNodeIdentification', () => {
    it('should call indexer performNodeIdentification', async () => {
      await service.performNodeIdentification();

      expect(mockIndexerService.performNodeIdentification).toHaveBeenCalled();
    });
  });

  describe('getNodeIdentification', () => {
    it('should return node identification from config', () => {
      mockConfig.nodeIdentification = { token: 'abc123' };

      const result = service.getNodeIdentification();

      expect(result).toEqual({ token: 'abc123' });
    });
  });

  describe('isDevelopment', () => {
    it('should return development mode status from env', () => {
      mockConfig.isDevelopment = true;

      const result = service.isDevelopment();

      expect(result).toBe(true);
    });
  });

  describe('isDockerEnvironment', () => {
    it('should return Docker environment status', () => {
      mockConfig.isDockerEnvironment = false;

      const result = service.isDockerEnvironment();

      expect(result).toBe(false);
    });
  });

  describe('getNodeIconBase64', () => {
    beforeEach(() => {
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };
    });

    it('should return base64 encoded icon', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('icon-data'));

      const result = service.getNodeIconBase64();

      expect(result).toBe(Buffer.from('icon-data').toString('base64'));
    });

    it('should return empty string when icon file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = service.getNodeIconBase64();

      expect(result).toBe('');
    });

    it('should return empty string on error', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = service.getNodeIconBase64();

      expect(result).toBe('');
    });
  });

  describe('getNodeAvatarBase64', () => {
    beforeEach(() => {
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };
    });

    it('should return base64 encoded avatar', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('avatar-data'));

      const result = service.getNodeAvatarBase64();

      expect(result).toBe(Buffer.from('avatar-data').toString('base64'));
    });

    it('should return empty string when avatar file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = service.getNodeAvatarBase64();

      expect(result).toBe('');
    });

    it('should return empty string on error', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = service.getNodeAvatarBase64();

      expect(result).toBe('');
    });
  });

  describe('getNodeBannerBase64', () => {
    beforeEach(() => {
      mockConfig.paths = {
        dataDirectoryPath: '/data',
        publicDirectoryPath: '/public',
      };
    });

    it('should return base64 encoded banner', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('banner-data'));

      const result = service.getNodeBannerBase64();

      expect(result).toBe(Buffer.from('banner-data').toString('base64'));
    });

    it('should return empty string when banner file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = service.getNodeBannerBase64();

      expect(result).toBe('');
    });

    it('should return empty string on error', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = service.getNodeBannerBase64();

      expect(result).toBe('');
    });
  });

  describe('markAllVideosAsNotIndexed', () => {
    it('should call repository markAllIndexedAsOutdated', async () => {
      mockVideosRepository.markAllIndexedAsOutdated = vi.fn();

      await service.markAllVideosAsNotIndexed();

      expect(mockVideosRepository.markAllIndexedAsOutdated).toHaveBeenCalled();
    });
  });

  describe('getIndexedVideos', () => {
    it('should return indexed videos from repository', async () => {
      const videos = [{ video_id: 'video1' }];
      mockVideosRepository.findIndexed = vi.fn().mockResolvedValue(videos);

      const result = await service.getIndexedVideos();

      expect(result).toEqual(videos);
    });
  });

  describe('exportAllData', () => {
    it('should export all data from repositories', async () => {
      mockVideosRepository.findAll = vi.fn().mockResolvedValue([]);
      mockCommentsRepository.findAll = vi.fn().mockResolvedValue([]);
      mockReportsVideosRepository.findAll = vi.fn().mockResolvedValue([]);
      mockReportsCommentsRepository.findAll = vi.fn().mockResolvedValue([]);
      mockReportsArchiveVideosRepository.findAll = vi.fn().mockResolvedValue([]);
      mockReportsArchiveCommentsRepository.findAll = vi.fn().mockResolvedValue([]);
      mockLiveChatMessagesRepository.findAll = vi.fn().mockResolvedValue([]);
      mockMonetizationRepository.findAll = vi.fn().mockResolvedValue([]);
      mockLinksRepository.findAll = vi.fn().mockResolvedValue([]);

      const result = await service.exportAllData();

      expect(result).toHaveProperty('videos');
      expect(result).toHaveProperty('comments');
      expect(result).toHaveProperty('videoReports');
      expect(result).toHaveProperty('commentReports');
      expect(result).toHaveProperty('liveChatMessages');
      expect(result).toHaveProperty('cryptoWalletAddresses');
      expect(result).toHaveProperty('links');
    });
  });

  describe('deleteAllData', () => {
    it('should delete all data from repositories', async () => {
      mockCommentsRepository.deleteAll = vi.fn();
      mockLiveChatMessagesRepository.deleteAll = vi.fn();
      mockReportsCommentsRepository.deleteAll = vi.fn();
      mockReportsVideosRepository.deleteAll = vi.fn();
      mockReportsArchiveCommentsRepository.deleteAll = vi.fn();
      mockReportsArchiveVideosRepository.deleteAll = vi.fn();

      await service.deleteAllData();

      expect(mockCommentsRepository.deleteAll).toHaveBeenCalled();
      expect(mockLiveChatMessagesRepository.deleteAll).toHaveBeenCalled();
    });
  });

  describe('importDatabase', () => {
    beforeEach(() => {
      mockVideosRepository.createMany = vi.fn();
      mockVideosRepository.deleteAll = vi.fn();
      mockCommentsRepository.createMany = vi.fn();
      mockCommentsRepository.deleteAll = vi.fn();
      mockReportsVideosRepository.createMany = vi.fn();
      mockReportsVideosRepository.deleteAll = vi.fn();
      mockReportsCommentsRepository.createMany = vi.fn();
      mockReportsCommentsRepository.deleteAll = vi.fn();
      mockReportsArchiveVideosRepository.createMany = vi.fn();
      mockReportsArchiveVideosRepository.deleteAll = vi.fn();
      mockReportsArchiveCommentsRepository.createMany = vi.fn();
      mockReportsArchiveCommentsRepository.deleteAll = vi.fn();
      mockLiveChatMessagesRepository.createMany = vi.fn();
      mockLiveChatMessagesRepository.deleteAll = vi.fn();
      mockMonetizationRepository.createMany = vi.fn();
      mockMonetizationRepository.deleteAll = vi.fn();
      mockLinksRepository.createMany = vi.fn();
      mockLinksRepository.deleteAll = vi.fn();
    });

    it('should import videos table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'videos', rows: [{ video_id: 'v1' }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockVideosRepository.deleteAll).toHaveBeenCalled();
      expect(mockVideosRepository.createMany).toHaveBeenCalledWith([{ video_id: 'v1' }]);
    });

    it('should import comments table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'comments', rows: [{ comment_id: 'c1' }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockCommentsRepository.createMany).toHaveBeenCalledWith([{ comment_id: 'c1' }]);
    });

    it('should import videoreports table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'videoreports', rows: [{ report_id: 'r1' }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockReportsVideosRepository.createMany).toHaveBeenCalled();
    });

    it('should import commentreports table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'commentreports', rows: [{ report_id: 'r1' }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockReportsCommentsRepository.createMany).toHaveBeenCalled();
    });

    it('should import livechatmessages table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'livechatmessages', rows: [{ message_id: 'm1' }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockLiveChatMessagesRepository.createMany).toHaveBeenCalled();
    });

    it('should import cryptowalletaddresses table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'cryptowalletaddresses', rows: [{ id: 1 }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockMonetizationRepository.createMany).toHaveBeenCalled();
    });

    it('should import links table', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'links', rows: [{ id: 1 }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockLinksRepository.createMany).toHaveBeenCalled();
    });

    it('should skip empty tables', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'videos', rows: [] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockVideosRepository.createMany).not.toHaveBeenCalled();
    });

    it('should warn on unknown table names', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'unknowntable', rows: [{ id: 1 }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockLogger.warn).toHaveBeenCalledWith('Unknown table name during import: unknowntable');
    });

    it('should import archive tables', async () => {
      const dbContent = JSON.stringify([
        { tableName: 'videoreportsarchives', rows: [{ id: 1 }] },
        { tableName: 'commentreportsarchives', rows: [{ id: 2 }] },
      ]);

      await service.importDatabase(dbContent);

      expect(mockReportsArchiveVideosRepository.createMany).toHaveBeenCalled();
      expect(mockReportsArchiveCommentsRepository.createMany).toHaveBeenCalled();
    });
  });
});
