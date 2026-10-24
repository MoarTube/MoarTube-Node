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
  validateLastCheckedContentTracker: vi.fn(),
}));

import { Config, initializeConfig, getConfig } from '@/config/index.js';
import { getEnv } from '@/config/env.js';
import { initializePaths } from '@/config/paths.js';
import { initializeUrls, buildNodeBaseUrl, buildExternalVideosBaseUrl, buildExternalResourcesBaseUrl } from '@/config/urls.js';
import {
  validateNodeSettings,
  validateLastCheckedContentTracker,
} from '@/config/schema.js';

describe('config/index.ts', () => {
  // Mock data
  const mockBaseDir = '/app';

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
    lastCheckedContentTrackerPath: '/app/data/_last_checked_content_tracker.json',
    toObject: vi.fn(() => ({
      baseDir: '/app',
      dataDirectoryPath: '/app/data',
    })),
  };

  const mockUrls = {
    cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
    toObject: vi.fn(() => ({
      cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
    })),
  };


  const mockNodeSettings = {
    nodeListeningPort: 8080,
    isSecure: false,
    publicNodeProtocol: 'https',
    publicNodeAddress: 'example.com',
    publicNodePort: 443,
    nodeName: 'Test Node',
    nodeAbout: 'A test node',
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
    (validateNodeSettings as MockedFunction<any>).mockImplementation((data) => data);
    (validateLastCheckedContentTracker as MockedFunction<any>).mockReturnValue(mockContentTracker);

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));

    // Setup fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('_node_settings.json')) {
        return JSON.stringify(mockNodeSettings);
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

  describe('tracker reload and watcher lifecycle', () => {
    it('reloads tracker changes, ignores rename events, and closes watchers once', () => {
      const config = Config.initialize(mockBaseDir);
      const callback = mockFs.watch.mock.calls.find(([file]) => file === mockPaths.lastCheckedContentTrackerPath)![1] as Function;
      const reload = vi.spyOn(config, 'reloadLastCheckedContentTracker');
      callback('rename');
      expect(reload).not.toHaveBeenCalled();
      const updated = { ...mockContentTracker, lastCheckedCommentsTimestamp: 99 };
      vi.mocked(validateLastCheckedContentTracker).mockReturnValue(updated);
      callback('change');
      expect(config.lastCheckedContentTracker).toEqual(updated);
      const watchers = mockFs.watch.mock.results.map((result) => result.value);
      config.cleanup();
      config.cleanup();
      for (const watcher of new Set(watchers)) expect(watcher.close).toHaveBeenCalledTimes(watchers.filter((value) => value === watcher).length);
      reload.mockRestore();
    });

    it('keeps tracker state when its file disappears or contains invalid JSON', () => {
      const config = Config.initialize(mockBaseDir);
      mockFs.existsSync.mockReturnValue(false);
      config.reloadLastCheckedContentTracker();
      expect(config.lastCheckedContentTracker).toEqual(mockContentTracker);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{bad json');
      const error = vi.spyOn((config as any).logger, 'error');
      config.reloadLastCheckedContentTracker();
      expect(error).toHaveBeenCalledWith('Failed to reload content tracker', expect.any(Error));
      expect(config.lastCheckedContentTracker).toEqual(mockContentTracker);
      error.mockRestore();
    });

    it('uses tracker defaults even when creating the defaults file fails', () => {
      mockFs.existsSync.mockImplementation((file) => file !== mockPaths.lastCheckedContentTrackerPath);
      mockFs.writeFileSync.mockImplementation((file) => { if (file === mockPaths.lastCheckedContentTrackerPath) throw new Error('read only'); });
      const config = Config.initialize(mockBaseDir);
      expect(config.lastCheckedContentTracker).toEqual({ lastCheckedCommentsTimestamp: 0, lastCheckedVideoReportsTimestamp: 0, lastCheckedCommentReportsTimestamp: 0 });
    });
  });

  describe('Config singleton', () => {
    it('should be a singleton', () => {
      const config1 = Config.initialize(mockBaseDir);
      const config2 = Config.getInstance();

      expect(config1).toBe(config2);
    });

    it('should return the same instance via initializeConfig()', () => {
      const config1 = initializeConfig(mockBaseDir);
      const config2 = initializeConfig(mockBaseDir);

      expect(config1).toBe(config2);
    });

    it('should return the same instance via getConfig()', () => {
      Config.initialize(mockBaseDir);
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should initialize all subsystems correctly', () => {
      Config.initialize(mockBaseDir);

      expect(getEnv).toHaveBeenCalledTimes(1);
      expect(initializePaths).toHaveBeenCalledWith(mockBaseDir, false, undefined);
      expect(initializeUrls).toHaveBeenCalledWith();
      expect(validateNodeSettings).toHaveBeenCalledTimes(1);
      expect(validateLastCheckedContentTracker).toHaveBeenCalledTimes(1);
      expect(mockFs.readFileSync.mock.calls).toEqual([
        [mockPaths.nodeSettingsPath, 'utf8'],
        [mockPaths.lastCheckedContentTrackerPath, 'utf8'],
      ]);
    });
  });

  describe('Data directory setup', () => {
    it('should create all required data directories', () => {
      Config.initialize(mockBaseDir);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.imagesDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.videosDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.databaseDirectoryPath, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPaths.certificatesDirectoryPath, { recursive: true });
    });
  });

  describe('Runtime mode', () => {

    it('should return correct development mode status from env', () => {
      const config = Config.initialize(mockBaseDir);
      expect(config.isDevelopment).toBe(false);
    });
  });

  describe('Node settings loading', () => {
    it('should load existing node settings from file', () => {
      Config.initialize(mockBaseDir);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockPaths.nodeSettingsPath, 'utf8');
      expect(validateNodeSettings).toHaveBeenCalledWith(mockNodeSettings);
    });

    it('should create default settings if file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPaths.nodeSettingsPath) return false;
        return true;
      });

      Config.initialize(mockBaseDir);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockPath.dirname(mockPaths.nodeSettingsPath), { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.nodeSettingsPath,
        expect.stringContaining('"nodeListeningPort": 9090')
      );
    });

    it('should return frozen node settings', () => {
      const config = Config.initialize(mockBaseDir);
      const nodeSettings = config.nodeSettings;

      expect(nodeSettings).toEqual(mockNodeSettings);

      // Should be frozen/read-only
      expect(() => {
        (nodeSettings as any).nodeName = 'Modified';
      }).toThrow();
    });

    it('should update node settings and persist to disk', () => {
      const config = Config.initialize(mockBaseDir);
      const updates = { nodeName: 'Updated Node' };

      config.updateNodeSettings(updates);

      expect(validateNodeSettings).toHaveBeenCalledWith({ ...mockNodeSettings, ...updates });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockPaths.nodeSettingsPath,
        JSON.stringify({ ...mockNodeSettings, nodeName: 'Updated Node' }, null, 2)
      );
    });

    it('should reload node settings from disk', () => {
      const config = Config.initialize(mockBaseDir);

      config.reloadNodeSettings();

      expect(validateNodeSettings).toHaveBeenCalledTimes(2); // Once during init, once during reload
    });
  });

  describe('Content tracker loading', () => {
    it('should load existing content tracker from file', () => {
      Config.initialize(mockBaseDir);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockPaths.lastCheckedContentTrackerPath, 'utf8');
      expect(validateLastCheckedContentTracker).toHaveBeenCalledWith(mockContentTracker);
    });

    it('should return defaults if tracker file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockPaths.lastCheckedContentTrackerPath) return false;
        return true;
      });

      const config = Config.initialize(mockBaseDir);

      expect(config.lastCheckedContentTracker).toEqual({
        lastCheckedCommentsTimestamp: 0,
        lastCheckedVideoReportsTimestamp: 0,
        lastCheckedCommentReportsTimestamp: 0,
      });
    });

    it('should return frozen content tracker', () => {
      const config = Config.initialize(mockBaseDir);
      const tracker = config.lastCheckedContentTracker;

      expect(tracker).toEqual(mockContentTracker);

      // Should be frozen/read-only
      expect(() => {
        (tracker as any).lastCheckedCommentsTimestamp = 999;
      }).toThrow();
    });

    it('should update content tracker and persist', () => {
      const config = Config.initialize(mockBaseDir);
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
      const config = Config.initialize(mockBaseDir);

      expect(config.runtime).toEqual({
        jwtSecret: '',
        isDockerEnvironment: false,
        isDevelopment: false,
      });
    });

    it('should return frozen runtime config', () => {
      const config = Config.initialize(mockBaseDir);
      const runtime = config.runtime;

      // Should be frozen/read-only
      expect(() => {
        (runtime as any).jwtSecret = 'modified';
      }).toThrow();
    });

    it('should set JWT secret', () => {
      const config = Config.initialize(mockBaseDir);
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
      const config = Config.initialize(mockBaseDir);
      expect(config.isDockerEnvironment).toBe(false);
    });
  });

  describe('Subsystem access', () => {
    it('should provide access to env subsystem', () => {
      const config = Config.initialize(mockBaseDir);
      expect(config.env).toBe(mockEnv);
    });

    it('should provide access to paths subsystem', () => {
      const config = Config.initialize(mockBaseDir);
      expect(config.paths).toBe(mockPaths);
    });

    it('should provide access to urls subsystem', () => {
      const config = Config.initialize(mockBaseDir);
      expect(config.urls).toBe(mockUrls);
    });
  });

  describe('URL builders', () => {
    it('should build node base URL', () => {
      const config = Config.initialize(mockBaseDir);

      (buildNodeBaseUrl as MockedFunction<any>).mockReturnValue('https://example.com');

      const result = config.getNodeBaseUrl();

      expect(buildNodeBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://example.com');
    });

    it('should build external videos base URL', () => {
      const config = Config.initialize(mockBaseDir);

      (buildExternalVideosBaseUrl as MockedFunction<any>).mockReturnValue('https://cdn.example.com/videos');

      const result = config.getExternalVideosBaseUrl();

      expect(buildExternalVideosBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://cdn.example.com/videos');
    });

    it('should build external resources base URL', () => {
      const config = Config.initialize(mockBaseDir);

      (buildExternalResourcesBaseUrl as MockedFunction<any>).mockReturnValue('https://example.com/resources');

      const result = config.getExternalResourcesBaseUrl();

      expect(buildExternalResourcesBaseUrl).toHaveBeenCalledWith(mockNodeSettings);
      expect(result).toBe('https://example.com/resources');
    });
  });

  describe('File watching', () => {
    it('should set up file watcher for settings file', () => {
      Config.initialize(mockBaseDir);

      expect(mockFs.watch).toHaveBeenCalledWith(mockPaths.nodeSettingsPath, expect.any(Function));
    });

    it('should reload settings when file changes', () => {
      Config.initialize(mockBaseDir);

      // Get the watch callback for settings file (second call to fs.watch)
      const watchCallback = mockFs.watch.mock.calls[1][1];

      // Simulate file change
      watchCallback('change');

      expect(validateNodeSettings).toHaveBeenCalledTimes(2); // Once during init, once during reload
    });

    it('should not reload settings for non-change events', () => {
      Config.initialize(mockBaseDir);

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

      const config = Config.initialize(mockBaseDir);

      config.cleanup();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup when no watcher exists', () => {
      const config = Config.initialize(mockBaseDir);

      // Simulate no watcher
      (config as any)._settingsWatcher = null;

      expect(() => config.cleanup()).not.toThrow();
    });
  });

  describe('Summary', () => {
    it('should return correct configuration summary', () => {
      const config = Config.initialize(mockBaseDir);
      const summary = config.toSummary();

      expect(summary).toEqual({
        env: { NODE_ENV: 'development', IS_DOCKER_ENVIRONMENT: 'false' },
        paths: {
          baseDir: '/app',
          dataDirectoryPath: '/app/data',
        },
        urls: {
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

    it('should handle JSON parse errors in node settings', () => {
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('_node_settings.json')) {
          return 'invalid json';
        }
        return JSON.stringify({});
      });

      expect(() => Config.initialize(mockBaseDir)).toThrow();
    });

    it('should handle validation errors in node settings', () => {
      (validateNodeSettings as MockedFunction<any>).mockImplementation(() => {
        throw new Error('Invalid node settings');
      });

      expect(() => Config.initialize(mockBaseDir)).toThrow('Invalid node settings');
    });
  });
});
