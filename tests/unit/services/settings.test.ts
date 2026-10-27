/**
 * Settings Service Tests
 *
 * Tests for the SettingsService class that handles node configuration management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsService } from '@/services/settings.js';
import type { Logger } from '@/utils/logger.js';
import type {
  CommentsRepository,
  ReportsVideosRepository,
  ReportsCommentsRepository,
  ReportsArchiveVideosRepository,
  ReportsArchiveCommentsRepository,
  LiveChatMessagesRepository,
} from '@/database/repositories/index.js';
import type { CloudflareService } from '@/services/cloudflare.js';

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
import { createBackup, restoreBackup } from '@/database/backup.js';
vi.mock('@/database/backup.js', () => ({
  createBackup: vi.fn().mockResolvedValue({ file: 'snapshot' }),
  restoreBackup: vi.fn().mockResolvedValue(undefined),
}));

describe('SettingsService', () => {
  let service: SettingsService;
  let mockLogger: Logger;
  let mockCommentsRepository: CommentsRepository;
  let mockReportsVideosRepository: ReportsVideosRepository;
  let mockReportsCommentsRepository: ReportsCommentsRepository;
  let mockReportsArchiveVideosRepository: ReportsArchiveVideosRepository;
  let mockReportsArchiveCommentsRepository: ReportsArchiveCommentsRepository;
  let mockLiveChatMessagesRepository: LiveChatMessagesRepository;
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

    mockCommentsRepository = {} as CommentsRepository;
    mockReportsVideosRepository = {} as ReportsVideosRepository;
    mockReportsCommentsRepository = {} as ReportsCommentsRepository;
    mockReportsArchiveVideosRepository = {} as ReportsArchiveVideosRepository;
    mockReportsArchiveCommentsRepository = {} as ReportsArchiveCommentsRepository;
    mockLiveChatMessagesRepository = {} as LiveChatMessagesRepository;

    mockCloudflareService = {
      isEnabled: vi.fn().mockReturnValue(false),
      purgeNodePage: vi.fn(),
    } as unknown as CloudflareService;

    mockConfig = {
      nodeSettings: {
        nodeName: 'Test Node',
        databaseConfig: { databaseDialect: 'sqlite' },
        nodeAbout: 'About text',
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
      mockCommentsRepository,
      mockReportsVideosRepository,
      mockReportsCommentsRepository,
      mockReportsArchiveVideosRepository,
      mockReportsArchiveCommentsRepository,
      mockLiveChatMessagesRepository,
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

    it('should purge Cloudflare cache when enabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);

      await service.updateNodeName('New Node Name');

      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
    });

    it('should not purge Cloudflare cache when disabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(false);

      await service.updateNodeName('New Node Name');

      expect(mockCloudflareService.purgeNodePage).not.toHaveBeenCalled();
    });
  });

  describe('updateNodeAbout', () => {
    it('should update node about locally', async () => {
      await service.updateNodeAbout('New about text');

      expect(mockConfig.updateNodeSettings).toHaveBeenCalledWith({ nodeAbout: 'New about text' });
      expect(mockLogger.info).toHaveBeenCalledWith('Node about updated');
    });

    it('should purge Cloudflare cache when enabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);

      await service.updateNodeAbout('New about text');

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
      expect(mockLogger.info).toHaveBeenCalledWith('Storage configuration updated', {
        mode: 'filesystem',
      });
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
      expect(call.storageConfig.s3Config.s3ProviderClientConfig.endpoint).toBe(
        'https://minio.example.com'
      );
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
      (
        mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }
      ).purgeNodeImages = vi.fn();

      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateAvatar('/tmp/icon.png', '/tmp/avatar.png');

      expect(
        (mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> })
          .purgeNodeImages
      ).toHaveBeenCalled();
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

      expect(fsMock.default.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('images'), {
        recursive: true,
      });
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

      expect(fsMock.default.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('images'), {
        recursive: true,
      });
    });

    it('should purge Cloudflare cache when enabled', async () => {
      vi.mocked(mockCloudflareService.isEnabled).mockReturnValue(true);
      (
        mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> }
      ).purgeNodeImages = vi.fn();

      const fsMock = await import('node:fs');
      fsMock.default.mkdirSync = vi.fn();
      fsMock.default.copyFileSync = vi.fn();

      await service.updateBanner('/tmp/banner.png');

      expect(
        (mockCloudflareService as unknown as { purgeNodeImages: ReturnType<typeof vi.fn> })
          .purgeNodeImages
      ).toHaveBeenCalled();
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
  it('delegates streaming backups using the current database configuration', async () => {
    mockConfig.nodeSettings.databaseConfig = { databaseDialect: 'sqlite' } as never;
    await service.createDatabaseBackup();
    await service.restoreDatabaseBackup('input');
    expect(createBackup).toHaveBeenLastCalledWith({
      dialect: 'sqlite',
      sqlitePath: mockConfig.paths.databaseFilePath,
    });
    expect(restoreBackup).toHaveBeenLastCalledWith('input', {
      dialect: 'sqlite',
      sqlitePath: mockConfig.paths.databaseFilePath,
    });
    mockConfig.nodeSettings.databaseConfig = {
      databaseDialect: 'postgres',
      postgresConfig: {
        username: 'u@',
        password: 'p:',
        host: 'localhost',
        port: 5432,
        databaseName: 'a/b',
      },
    } as never;
    await service.createDatabaseBackup();
    expect(createBackup).toHaveBeenLastCalledWith({
      dialect: 'postgres',
      postgresUrl: 'postgres://u%40:p%3A@localhost:5432/a%2Fb',
    });
    mockConfig.nodeSettings.databaseConfig = { databaseDialect: 'postgres' } as never;
    await expect(service.createDatabaseBackup()).rejects.toThrow('Missing PostgreSQL');
  });
});
