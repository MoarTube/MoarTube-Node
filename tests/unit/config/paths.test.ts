import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { Paths, initializePaths, type PathConfig } from '@/config/paths.js';

// Mock the env module
vi.mock('@config/env.js', () => ({
  getEnv: vi.fn(),
}));

import { getEnv } from '@config/env.js';

describe('config/paths.ts', () => {
  const mockGetEnv = vi.mocked(getEnv);
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    Paths.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    Paths.resetInstance();
  });

  describe('Paths singleton', () => {
    it('should be a singleton', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths1 = Paths.initialize('/app');
      const paths2 = Paths.getInstance();

      expect(paths1).toBe(paths2);
    });

    it('should throw error when getting instance before initialization', () => {
      expect(() => Paths.getInstance()).toThrow('Paths not initialized');
    });

    it('should return true for isInitialized after initialization', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);

      expect(Paths.isInitialized()).toBe(false);

      Paths.initialize('/app');

      expect(Paths.isInitialized()).toBe(true);
    });

    it('should return the same instance via initializePaths()', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths1 = initializePaths('/app');
      const paths2 = initializePaths('/app');

      expect(paths1).toBe(paths2);
    });
  });

  describe('Path construction - Non-Docker environment', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = new Paths('/app');
    });

    it('should construct base directory paths correctly', () => {
      expect(paths.publicDirectoryPath).toBe(path.join('/app', 'public'));
      expect(paths.viewsDirectoryPath).toBe(path.join('/app', 'public', 'views'));
      expect(paths.dataDirectoryPath).toBe(path.join('/app', 'data'));
    });

    it('should construct data subdirectory paths correctly', () => {
      expect(paths.imagesDirectoryPath).toBe(path.join('/app', 'data', 'images'));
      expect(paths.videosDirectoryPath).toBe(path.join('/app', 'data', 'media', 'videos'));
      expect(paths.databaseDirectoryPath).toBe(path.join('/app', 'data', 'db'));
      expect(paths.certificatesDirectoryPath).toBe(path.join('/app', 'data', 'certificates'));
    });

    it('should construct config file paths correctly', () => {
      expect(paths.nodeSettingsPath).toBe(path.join('/app', 'data', '_node_settings.json'));
      expect(paths.nodeIdentificationPath).toBe(path.join('/app', 'data', '_node_identification.json'));
      expect(paths.lastCheckedContentTrackerPath).toBe(path.join('/app', 'data', '_last_checked_content_tracker.json'));
      expect(paths.databaseFilePath).toBe(path.join('/app', 'data', 'db', 'node_db.sqlite'));
    });
  });

  describe('Path construction - Docker environment', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: true };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = new Paths('/app');
    });

    it('should use /data as data directory in Docker environment', () => {
      expect(paths.dataDirectoryPath).toBe('/data');
    });

    it('should construct data subdirectory paths correctly in Docker', () => {
      expect(paths.imagesDirectoryPath).toBe(path.join('/data', 'images'));
      expect(paths.videosDirectoryPath).toBe(path.join('/data', 'media', 'videos'));
      expect(paths.databaseDirectoryPath).toBe(path.join('/data', 'db'));
      expect(paths.certificatesDirectoryPath).toBe(path.join('/data', 'certificates'));
    });

    it('should construct config file paths correctly in Docker', () => {
      expect(paths.nodeSettingsPath).toBe(path.join('/data', '_node_settings.json'));
      expect(paths.nodeIdentificationPath).toBe(path.join('/data', '_node_identification.json'));
      expect(paths.lastCheckedContentTrackerPath).toBe(path.join('/data', '_last_checked_content_tracker.json'));
      expect(paths.databaseFilePath).toBe(path.join('/data', 'db', 'node_db.sqlite'));
    });
  });

  describe('Video-specific path methods', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = new Paths('/app');
    });

    it('should return correct video directory path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId);
      expect(paths.getVideoDirectoryPath(videoId)).toBe(expected);
    });

    it('should return correct video images directory path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'images');
      expect(paths.getVideoImagesDirectoryPath(videoId)).toBe(expected);
    });

    it('should return correct video adaptive directory path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'adaptive');
      expect(paths.getVideoAdaptiveDirectoryPath(videoId)).toBe(expected);
    });

    it('should return correct video progressive directory path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'progressive');
      expect(paths.getVideoProgressiveDirectoryPath(videoId)).toBe(expected);
    });

    it('should return correct video thumbnail path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'images', 'thumbnail.jpg');
      expect(paths.getVideoThumbnailPath(videoId)).toBe(expected);
    });

    it('should return correct video preview path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'images', 'preview.jpg');
      expect(paths.getVideoPreviewPath(videoId)).toBe(expected);
    });

    it('should return correct video poster path', () => {
      const videoId = 'abc123';
      const expected = path.join('/app', 'data', 'media', 'videos', videoId, 'images', 'poster.jpg');
      expect(paths.getVideoPosterPath(videoId)).toBe(expected);
    });
  });

  describe('Icon, avatar, and banner path methods', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = new Paths('/app');
    });

    it('should return correct custom icon path', () => {
      const expected = path.join('/app', 'data', 'images', 'icon.png');
      expect(paths.getCustomIconPath()).toBe(expected);
    });

    it('should return correct default icon path', () => {
      const expected = path.join('/app', 'public', 'images', 'icon.png');
      expect(paths.getDefaultIconPath()).toBe(expected);
    });

    it('should return correct custom avatar path', () => {
      const expected = path.join('/app', 'data', 'images', 'avatar.png');
      expect(paths.getCustomAvatarPath()).toBe(expected);
    });

    it('should return correct default avatar path', () => {
      const expected = path.join('/app', 'public', 'images', 'avatar.png');
      expect(paths.getDefaultAvatarPath()).toBe(expected);
    });

    it('should return correct custom banner path', () => {
      const expected = path.join('/app', 'data', 'images', 'banner.png');
      expect(paths.getCustomBannerPath()).toBe(expected);
    });

    it('should return correct default banner path', () => {
      const expected = path.join('/app', 'public', 'images', 'banner.png');
      expect(paths.getDefaultBannerPath()).toBe(expected);
    });
  });

  describe('toObject method', () => {
    it('should return all paths as a plain object - Non-Docker', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = new Paths('/app');

      const obj = paths.toObject();

      expect(obj).toEqual({
        publicDirectoryPath: path.join('/app', 'public'),
        dataDirectoryPath: path.join('/app', 'data'),
        viewsDirectoryPath: path.join('/app', 'public', 'views'),
        imagesDirectoryPath: path.join('/app', 'data', 'images'),
        videosDirectoryPath: path.join('/app', 'data', 'media', 'videos'),
        databaseDirectoryPath: path.join('/app', 'data', 'db'),
        certificatesDirectoryPath: path.join('/app', 'data', 'certificates'),
        nodeSettingsPath: path.join('/app', 'data', '_node_settings.json'),
        nodeIdentificationPath: path.join('/app', 'data', '_node_identification.json'),
        lastCheckedContentTrackerPath: path.join('/app', 'data', '_last_checked_content_tracker.json'),
        databaseFilePath: path.join('/app', 'data', 'db', 'node_db.sqlite'),
      });

      // Should be a plain object, not the Paths instance
      expect(obj.constructor.name).toBe('Object');
    });

    it('should return all paths as a plain object - Docker', () => {
      mockEnv = { isDockerEnvironment: true };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = new Paths('/app');

      const obj = paths.toObject();

      expect(obj.dataDirectoryPath).toBe('/data');
      expect(obj.imagesDirectoryPath).toBe(path.join('/data', 'images'));
      expect(obj.videosDirectoryPath).toBe(path.join('/data', 'media', 'videos'));
    });
  });

  describe('Path normalization', () => {
    it('should handle Windows-style paths correctly', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = new Paths('C:\\app');

      // Node.js path.join should handle platform-specific separators
      expect(paths.publicDirectoryPath).toContain('public');
      expect(paths.dataDirectoryPath).toContain('data');
    });

    it('should handle relative paths correctly', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = new Paths('./app');

      expect(paths.publicDirectoryPath).toBe(path.join('./app', 'public'));
      expect(paths.dataDirectoryPath).toBe(path.join('./app', 'data'));
    });
  });
});