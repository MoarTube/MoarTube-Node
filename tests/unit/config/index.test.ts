import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Mock all file system operations
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    watch: vi.fn(),
    rm: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  watch: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn(),
    dirname: vi.fn(),
  },
}));

vi.mock('node:crypto', () => ({
  default: {
    randomBytes: vi.fn(),
  },
}));

// Mock config subsystems
vi.mock('@/config/env.js', () => ({
  getEnv: vi.fn(),
}));

vi.mock('@/config/paths.js', () => ({
  initializePaths: vi.fn(),
}));

vi.mock('@/config/urls.js', () => ({
  initializeUrls: vi.fn(),
  buildNodeBaseUrl: vi.fn(),
  buildExternalVideosBaseUrl: vi.fn(),
  buildExternalResourcesBaseUrl: vi.fn(),
}));

vi.mock('@/config/schema.js', () => ({
  validateNodeSettings: vi.fn(),
  validateAppConfig: vi.fn(),
  validateNodeIdentification: vi.fn(),
  validateLastCheckedContentTracker: vi.fn(),
}));

import { Config, initializeConfig, getConfig } from '@/config/index.js';
import { getEnv } from '@/config/env.js';
import { initializePaths } from '@/config/paths.js';
import { initializeUrls, buildNodeBaseUrl, buildExternalVideosBaseUrl, buildExternalResourcesBaseUrl } from '@/config/urls.js';
import {
  validateNodeSettings,
  validateAppConfig,
  validateNodeIdentification,
  validateLastCheckedContentTracker,
} from '@/config/schema.js';

describe('config/index.ts', () => {
  // Mock data
  const mockBaseDir = '/app';
  const mockConfigFileName = 'config.json';

  const mockEnv = {
    isDockerEnvironment: false,
    isDevelopment: false,
    getAll: vi.fn(() => ({ NODE_ENV: 'development', IS_DOCKER_ENVIRONMENT: 'false' })),
  };

  const mockPaths = {
    imagesDirectoryPath: '/app/data/images',
    videosDirectoryPath: '/app/data/videos',
    databaseDirectoryPath: '/app/data/db',
    certificatesDirectoryPath: '/app/data/certificates',
    nodeSettingsPath: '/app/data/_node_settings.json',
    nodeIdentificationPath: '/app/data/_node_identification.json',
    lastCheckedContentTrackerPath: '/app/data/_last_checked_content_tracker.json',
    toObject: vi.fn(() => ({
      baseDir: '/app',
      configFileName: 'config.json',
      dataDirectoryPath: '/app/data',
    })),
  };

  const mockUrls = {
    indexerUrl: 'https://indexer.moartube.com',
    aliaserUrl: 'https://aliaser.moartube.com',
    cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
    toObject: vi.fn(() => ({
      indexerUrl: 'https://indexer.moartube.com',
      aliaserUrl: 'https://aliaser.moartube.com',
      cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
    })),
  };

  const mockAppConfig = {
    indexerConfig: {
      httpProtocol: 'https',
      host: 'indexer.moartube.com',
      port: 443,
    },
    aliaserConfig: {
      httpProtocol: 'https',
      host: 'aliaser.moartube.com',
      port: 443,
    },
  };

  const mockNodeSettings = {
    nodeListeningPort: 8080,
    isSecure: false,
    publicNodeProtocol: 'https',
    publicNodeAddress: 'example.com',
    publicNodePort: 443,
    nodeName: 'Test Node',
    nodeAbout: 'A test node',
    nodeId: 'node-123',
    username: 'hashed-username',
    password: 'hashed-password',
    isCloudflareCdnEnabled: false,
    cloudflareEmailAddress: '',
    cloudflareZoneId: '',
    cloudflareGlobalApiKey: '',
    isCloudflareTurnstileEnabled: false,
    cloudflareTurnstileSiteKey: '',
    cloudflareTurnstileSecretKey: '',
    isCommentsEnabled: true,
    isLikesEnabled: true,
    isDislikesEnabled: true,
    isReportsEnabled: true,
    isLiveChatEnabled: true,
    databaseConfig: {
      databaseDialect: 'sqlite',
    },
    storageConfig: {
      storageMode: 'filesystem',
    },
  };

  const mockNodeIdentification = {
    moarTubeTokenProof: 'token-proof-123',
  };

  const mockContentTracker = {
    lastCheckedCommentsTimestamp: 1234567890,
    lastCheckedVideoReportsTimestamp: 1234567891,
    lastCheckedCommentReportsTimestamp: 1234567892,
  };

  let mockFs: typeof fs;
  let mockPath: typeof path;
  let mockCrypto: typeof crypto;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mocked modules
    mockFs = vi.mocked(fs);
    mockPath = vi.mocked(path);
    mockCrypto = vi.mocked(crypto);

    // Reset Config singleton
    (Config as any).instance = undefined;

    // Setup default mocks
    (getEnv as MockedFunction<any>).mockReturnValue(mockEnv);
    (initializePaths as MockedFunction<any>).mockReturnValue(mockPaths);
    (initializeUrls as MockedFunction<any>).mockReturnValue(mockUrls);
    (validateAppConfig as MockedFunction<any>).mockReturnValue(mockAppConfig);
    (validateNodeSettings as MockedFunction<any>).mockImplementation((data) => data);
    (validateNodeIdentification as MockedFunction<any>).mockImplementation((data) => data);
    (validateLastCheckedContentTracker as MockedFunction<any>).mockReturnValue(mockContentTracker);

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));

    // Setup fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.json')) {
        return JSON.stringify(mockAppConfig);
      }
      if (filePath.includes('_node_settings.json')) {
        return JSON.stringify(mockNodeSettings);
      }
      if (filePath.includes('_node_identification.json')) {
        return JSON.stringify(mockNodeIdentification);
      }
      if (filePath.includes('_last_checked_content_tracker.json')) {
        return JSON.stringify(mockContentTracker);
      }
      return '{}';
    });
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.watch.mockReturnValue({ close: vi.fn() } as any);

    // Setup crypto mock
    const mockBuffer = Buffer.from('mock-random-bytes-for-jwt-secret');
    mockCrypto.randomBytes.mockReturnValue(mockBuffer);
    mockBuffer.toString = vi.fn().mockReturnValue('mock-random-bytes-for-jwt-secret');
  });

  afterEach(() => {
    // Clean up Config singleton
    (Config as any).instance = undefined;
  });

  describe('Config singleton', () => {
    it('should be a singleton', () => {
      const config1 = Config.initialize(mockBaseDir, mockConfigFileName);
      const config2 = Config.getInstance();

      expect(config1).toBe(config2);
    });

    it('should return the same instance via initializeConfig()', () => {
      const config1 = initializeConfig(mockBaseDir, mockConfigFileName);
      const config2 = initializeConfig(mockBaseDir, mockConfigFileName);

      expect(config1).toBe(config2);
    });

    it('should return the same instance via getConfig()', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should initialize all subsystems correctly', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      expect(getEnv).toHaveBeenCalledTimes(1);
      expect(initializePaths).toHaveBeenCalledWith(mockBaseDir, false, undefined);
      expect(validateAppConfig).toHaveBeenCalledTimes(1);
      expect(initializeUrls).toHaveBeenCalledWith(mockAppConfig.indexerConfig, mockAppConfig.aliaserConfig);
      expect(validateNodeSettings).toHaveBeenCalledTimes(1);
      expect(validateNodeIdentification).toHaveBeenCalledTimes(1);
      expect(validateLastCheckedContentTracker).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data directory setup', () => {
    it('should create all required data directories', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.imagesDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.videosDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.databaseDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.certificatesDirectoryPath, { recursive: true });
    });
  });

  describe('App config loading', () => {
    it('should load and validate app config from file', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockPath.join).toHaveBeenCalledWith(mockBaseDir, mockConfigFileName);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/app/config.json', 'utf8');
      expect(validateAppConfig).toHaveBeenCalledWith(mockAppConfig);
    });

    it('should throw error if app config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => Config.initialize(mockBaseDir, mockConfigFileName)).toThrow('App config not found: /app/config.json');
    });

    it('should return frozen app config', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const appConfig = config.appConfig;

      expect(appConfig).toEqual(mockAppConfig);

      // Should be frozen/read-only
      expect(() => {
        (appConfig as any).indexerConfig = {};
      }).toThrow();
    });

    it('should return correct development mode status from env', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      expect(config.isDevelopment).toBe(false);
    });
  });

  describe('Node settings loading', () => {
    it('should load existing node settings from file', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockPaths.nodeSettingsPath, 'utf8');
      expect(validateNodeSettings).toHaveBeenCalledWith(mockNodeSettings);
    });

    it('should create default settings if file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPaths.nodeSettingsPath) return false;
        return true;
      });

      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPath.dirname(mockPaths.nodeSettingsPath), { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.nodeSettingsPath,
        expect.stringContaining('"nodeListeningPort": 80')
      );
    });

    it('should return frozen node settings', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const nodeSettings = config.nodeSettings;

      expect(nodeSettings).toEqual(mockNodeSettings);

      // Should be frozen/read-only
      expect(() => {
        (nodeSettings as any).nodeName = 'Modified';
      }).toThrow();
    });

    it('should update node settings and persist to disk', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const updates = { nodeName: 'Updated Node' };

      config.updateNodeSettings(updates);

      expect(validateNodeSettings).toHaveBeenCalledWith({ ...mockNodeSettings, ...updates });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.nodeSettingsPath,
        JSON.stringify({ ...mockNodeSettings, nodeName: 'Updated Node' }, null, 2)
      );
    });

    it('should reload node settings from disk', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      config.reloadNodeSettings();

      expect(validateNodeSettings).toHaveBeenCalledTimes(2); // Once during init, once during reload
    });
  });

  describe('Node identification loading', () => {
    it('should load existing node identification from file', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockPaths.nodeIdentificationPath, 'utf8');
      expect(validateNodeIdentification).toHaveBeenCalledWith(mockNodeIdentification);
    });

    it('should return null if identification file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPaths.nodeIdentificationPath) return false;
        return true;
      });

      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      expect(config.nodeIdentification).toBeNull();
    });

    it('should return null if identification file has invalid JSON', () => {
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('_node_identification.json')) {
          return 'invalid json';
        }
        return JSON.stringify(mockNodeIdentification);
      });

      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      expect(config.nodeIdentification).toBeNull();
    });

    it('should return frozen node identification', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const identification = config.nodeIdentification;

      expect(identification).toEqual(mockNodeIdentification);

      // Should be frozen/read-only
      expect(() => {
        (identification as any).moarTubeTokenProof = 'modified';
      }).toThrow();
    });

    it('should set and persist node identification', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const newIdentification = { moarTubeTokenProof: 'new-token' };

      config.setNodeIdentification(newIdentification);

      expect(validateNodeIdentification).toHaveBeenCalledWith(newIdentification);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.nodeIdentificationPath,
        JSON.stringify(newIdentification)
      );
      expect(config.nodeIdentification).toEqual(newIdentification);
    });
  });

  describe('Content tracker loading', () => {
    it('should load existing content tracker from file', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockPaths.lastCheckedContentTrackerPath, 'utf8');
      expect(validateLastCheckedContentTracker).toHaveBeenCalledWith(mockContentTracker);
    });

    it('should return defaults if tracker file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPaths.lastCheckedContentTrackerPath) return false;
        return true;
      });

      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      expect(config.lastCheckedContentTracker).toEqual({
        lastCheckedCommentsTimestamp: 0,
        lastCheckedVideoReportsTimestamp: 0,
        lastCheckedCommentReportsTimestamp: 0,
      });
    });

    it('should return frozen content tracker', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const tracker = config.lastCheckedContentTracker;

      expect(tracker).toEqual(mockContentTracker);

      // Should be frozen/read-only
      expect(() => {
        (tracker as any).lastCheckedCommentsTimestamp = 999;
      }).toThrow();
    });

    it('should update content tracker and persist', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const updates = { lastCheckedCommentsTimestamp: 9999999999 };

      config.updateLastCheckedContentTracker(updates);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.lastCheckedContentTrackerPath,
        JSON.stringify({ ...mockContentTracker, ...updates })
      );
    });
  });

  describe('Runtime configuration', () => {
    it('should initialize runtime config correctly', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      expect(config.runtime).toEqual({
        jwtSecret: '',
        isDockerEnvironment: false,
        isDevelopment: false,
      });
    });

    it('should return frozen runtime config', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const runtime = config.runtime;

      // Should be frozen/read-only
      expect(() => {
        (runtime as any).jwtSecret = 'modified';
      }).toThrow();
    });

    it('should set JWT secret', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const secret = 'my-jwt-secret';

      config.setJwtSecret(secret);

      expect(config.jwtSecret).toBe(secret);
      expect(config.runtime.jwtSecret).toBe(secret);
    });

    it('should generate JWT secret', () => {
      const secret = Config.generateJwtSecret();

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(64);
      expect(secret).toBe('mock-random-bytes-for-jwt-secret');
    });

    it('should return correct Docker environment status', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      expect(config.isDockerEnvironment).toBe(false);
    });
  });

  describe('Subsystem access', () => {
    it('should provide access to env subsystem', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      expect(config.env).toBe(mockEnv);
    });

    it('should provide access to paths subsystem', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      expect(config.paths).toBe(mockPaths);
    });

    it('should provide access to urls subsystem', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      expect(config.urls).toBe(mockUrls);
    });
  });

  describe('URL builders', () => {
    it('should build node base URL', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      (buildNodeBaseUrl as MockedFunction<any>).mockReturnValue('https://example.com');

      const result = config.getNodeBaseUrl();

      expect(buildNodeBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://example.com');
    });

    it('should build external videos base URL', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      (buildExternalVideosBaseUrl as MockedFunction<any>).mockReturnValue('https://cdn.example.com/videos');

      const result = config.getExternalVideosBaseUrl();

      expect(buildExternalVideosBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://cdn.example.com/videos');
    });

    it('should build external resources base URL', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      (buildExternalResourcesBaseUrl as MockedFunction<any>).mockReturnValue('https://example.com/resources');

      const result = config.getExternalResourcesBaseUrl();

      expect(buildExternalResourcesBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://example.com/resources');
    });
  });

  describe('File watching', () => {
    it('should set up file watcher for settings file', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      expect(mockFs.watch).toHaveBeenCalledWith(mockPaths.nodeSettingsPath, expect.any(Function));
    });

    it('should reload settings when file changes', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      // Get the watch callback for settings file (second call to fs.watch)
      const watchCallback = mockFs.watch.mock.calls[1][1];

      // Simulate file change
      watchCallback('change');

      expect(validateNodeSettings).toHaveBeenCalledTimes(2); // Once during init, once during reload
    });

    it('should not reload settings for non-change events', () => {
      Config.initialize(mockBaseDir, mockConfigFileName);

      // Get the watch callback for settings file (second call to fs.watch)
      const watchCallback = mockFs.watch.mock.calls[1][1];

      // Simulate non-change event
      watchCallback('rename');

      expect(validateNodeSettings).toHaveBeenCalledTimes(1); // Only during init
    });
  });

  describe('Cleanup', () => {
    it('should close file watcher during cleanup', () => {
      const mockWatcher = { close: vi.fn() };
      mockFs.watch.mockReturnValue(mockWatcher as any);

      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      config.cleanup();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup when no watcher exists', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);

      // Simulate no watcher
      (config as any)._settingsWatcher = null;

      expect(() => config.cleanup()).not.toThrow();
    });
  });

  describe('Summary', () => {
    it('should return correct configuration summary', () => {
      const config = Config.initialize(mockBaseDir, mockConfigFileName);
      const summary = config.toSummary();

      expect(summary).toEqual({
        env: { NODE_ENV: 'development', IS_DOCKER_ENVIRONMENT: 'false' },
        paths: {
          baseDir: '/app',
          configFileName: 'config.json',
          dataDirectoryPath: '/app/data',
        },
        urls: {
          indexerUrl: 'https://indexer.moartube.com',
          aliaserUrl: 'https://aliaser.moartube.com',
          cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
        },
        isDevelopment: false,
        isDockerEnvironment: false,
        storageMode: 'filesystem',
        databaseDialect: 'sqlite',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle JSON parse errors in app config', () => {
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return 'invalid json';
        }
        return '{}';
      });

      expect(() => Config.initialize(mockBaseDir, mockConfigFileName)).toThrow();
    });

    it('should handle JSON parse errors in node settings', () => {
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('_node_settings.json')) {
          return 'invalid json';
        }
        return JSON.stringify(mockAppConfig);
      });

      expect(() => Config.initialize(mockBaseDir, mockConfigFileName)).toThrow();
    });

    it('should handle validation errors in app config', () => {
      (validateAppConfig as MockedFunction<any>).mockImplementation(() => {
        throw new Error('Invalid app config');
      });

      expect(() => Config.initialize(mockBaseDir, mockConfigFileName)).toThrow('Invalid app config');
    });

    it('should handle validation errors in node settings', () => {
      (validateNodeSettings as MockedFunction<any>).mockImplementation(() => {
        throw new Error('Invalid node settings');
      });

      expect(() => Config.initialize(mockBaseDir, mockConfigFileName)).toThrow('Invalid node settings');
    });
  });
});