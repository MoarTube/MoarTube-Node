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

      const paths1 = Paths.initialize('/app', true);
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

      Paths.initialize('/app', true);

      expect(Paths.isInitialized()).toBe(true);
    });

    it('should return the same instance via initializePaths()', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths1 = initializePaths('/app', true);
      const paths2 = initializePaths('/app', true);

      expect(paths1).toBe(paths2);
    });
  });

  describe('Path construction - Bundled builds (entryPointDir)', () => {
    it('should use entryPointDir for public paths when bundled (dist directory)', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      
      // Simulate bundled build where entryPointDir is the dist directory
      const paths = Paths.initialize('/project', true, '/project/dist');
      
      // Public directory should be in dist folder
      expect(paths.publicDirectoryPath).toBe(path.join('/project/dist', 'public'));
      expect(paths.viewsDirectoryPath).toBe(path.join('/project/dist', 'public', 'views'));
      // Data directory still follows normal resolution (developer mode)
      expect(paths.dataDirectoryPath).toBe(path.join('/project', 'data'));
    });

    it('should use entryPointDir when path ends with dist', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      
      const paths = Paths.initialize('/app', true, '/app/output/dist');
      
      expect(paths.publicDirectoryPath).toBe(path.join('/app/output/dist', 'public'));
    });

    it('should use baseDir for public paths when entryPointDir is undefined', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      
      const paths = Paths.initialize('/app', true, undefined);
      
      expect(paths.publicDirectoryPath).toBe(path.join('/app', 'public'));
      expect(paths.viewsDirectoryPath).toBe(path.join('/app', 'public', 'views'));
    });

    it('should use baseDir for public paths when entryPointDir does not contain dist', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      
      // entryPointDir that doesn't indicate a bundled build
      const paths = Paths.initialize('/app', true, '/app/src');
      
      expect(paths.publicDirectoryPath).toBe(path.join('/app', 'public'));
    });
  });

  describe('Path construction - Non-Docker environment (Developer Mode)', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = Paths.initialize('/app', true); // Developer mode = true for local data path
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
      paths = Paths.initialize('/app', false); // Docker takes priority over isDeveloperMode
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

  describe('Path construction - MOARTUBE_DATA_DIR environment variable', () => {
    it('should use MOARTUBE_DATA_DIR when set (highest priority)', () => {
      const customDataDir = '/custom/moartube/data';
      mockEnv = { isDockerEnvironment: false, dataDirectory: customDataDir };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths = Paths.initialize('/app', false);

      expect(paths.dataDirectoryPath).toBe(customDataDir);
      expect(paths.imagesDirectoryPath).toBe(path.join(customDataDir, 'images'));
      expect(paths.videosDirectoryPath).toBe(path.join(customDataDir, 'media', 'videos'));
      expect(paths.databaseDirectoryPath).toBe(path.join(customDataDir, 'db'));
    });

    it('should use MOARTUBE_DATA_DIR even when Docker environment is true', () => {
      const customDataDir = '/my/custom/path';
      mockEnv = { isDockerEnvironment: true, dataDirectory: customDataDir };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths = Paths.initialize('/app', false);

      // MOARTUBE_DATA_DIR takes priority over Docker's /data
      expect(paths.dataDirectoryPath).toBe(customDataDir);
    });

    it('should use MOARTUBE_DATA_DIR even when developer mode is true', () => {
      const customDataDir = '/override/dev/data';
      mockEnv = { isDockerEnvironment: false, dataDirectory: customDataDir };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths = Paths.initialize('/app', true); // isDeveloperMode = true

      // MOARTUBE_DATA_DIR takes priority over developer mode
      expect(paths.dataDirectoryPath).toBe(customDataDir);
    });

    it('should ignore empty MOARTUBE_DATA_DIR and fall back to next priority', () => {
      mockEnv = { isDockerEnvironment: true, dataDirectory: '' };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths = Paths.initialize('/app', false);

      // Empty string should fall back to Docker's /data
      expect(paths.dataDirectoryPath).toBe('/data');
    });

    it('should handle Windows-style MOARTUBE_DATA_DIR paths', () => {
      const customDataDir = 'D:\\MoarTube\\Data';
      mockEnv = { isDockerEnvironment: false, dataDirectory: customDataDir };
      mockGetEnv.mockReturnValue(mockEnv);

      const paths = Paths.initialize('/app', false);

      expect(paths.dataDirectoryPath).toBe(customDataDir);
      expect(paths.imagesDirectoryPath).toBe(path.join(customDataDir, 'images'));
    });
  });

  describe('Video-specific path methods', () => {
    let paths: Paths;

    beforeEach(() => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      paths = Paths.initialize('/app', true); // Developer mode for local data path
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
      paths = Paths.initialize('/app', true); // Developer mode for local data path
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
    it('should return all paths as a plain object - Non-Docker (Developer Mode)', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = Paths.initialize('/app', true); // Developer mode for local data path

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
      const paths = Paths.initialize('/app', false); // Docker takes priority

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
      const paths = Paths.initialize('C:\\app', true); // Developer mode for local data path

      // Node.js path.join should handle platform-specific separators
      expect(paths.publicDirectoryPath).toContain('public');
      expect(paths.dataDirectoryPath).toContain('data');
    });

    it('should handle relative paths correctly', () => {
      mockEnv = { isDockerEnvironment: false };
      mockGetEnv.mockReturnValue(mockEnv);
      const paths = Paths.initialize('./app', true); // Developer mode for local data path

      expect(paths.publicDirectoryPath).toBe(path.join('./app', 'public'));
      expect(paths.dataDirectoryPath).toBe(path.join('./app', 'data'));
    });
  });

  describe('OS-specific data directory - Production mode', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore original environment
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    describe('Windows (win32)', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should use APPDATA directory on Windows in production mode', () => {
        process.env['APPDATA'] = 'C:\\Users\\Test\\AppData\\Roaming';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        const paths = Paths.initialize('/app', false); // Production mode (isDeveloperMode = false)

        expect(paths.dataDirectoryPath).toBe(path.join('C:\\Users\\Test\\AppData\\Roaming', 'moartube-node'));
      });

      it('should throw error when APPDATA is not set on Windows', () => {
        process.env['APPDATA'] = '';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'APPDATA environment variable is not set'
        );
      });

      it('should throw error when APPDATA is undefined on Windows', () => {
        delete process.env['APPDATA'];
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'APPDATA environment variable is not set'
        );
      });
    });

    describe('macOS (darwin)', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should use ~/Library/Application Support on macOS in production mode', () => {
        process.env['HOME'] = '/Users/testuser';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        const paths = Paths.initialize('/app', false); // Production mode

        expect(paths.dataDirectoryPath).toBe(path.join('/Users/testuser', 'Library', 'Application Support', 'moartube-node'));
      });

      it('should throw error when HOME is not set on macOS', () => {
        process.env['HOME'] = '';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'HOME environment variable is not set'
        );
      });

      it('should throw error when HOME is undefined on macOS', () => {
        delete process.env['HOME'];
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'HOME environment variable is not set'
        );
      });
    });

    describe('Linux and other Unix-like systems', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
      });

      it('should use ~/.local/share on Linux in production mode', () => {
        process.env['HOME'] = '/home/testuser';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        const paths = Paths.initialize('/app', false); // Production mode

        expect(paths.dataDirectoryPath).toBe(path.join('/home/testuser', '.local', 'share', 'moartube-node'));
      });

      it('should throw error when HOME is not set on Linux', () => {
        process.env['HOME'] = '';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'HOME environment variable is not set'
        );
      });

      it('should throw error when HOME is undefined on Linux', () => {
        delete process.env['HOME'];
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        expect(() => Paths.initialize('/app', false)).toThrow(
          'HOME environment variable is not set'
        );
      });
    });

    describe('Other Unix-like systems (FreeBSD)', () => {
      it('should use ~/.local/share on FreeBSD in production mode', () => {
        Object.defineProperty(process, 'platform', { value: 'freebsd' });
        process.env['HOME'] = '/home/testuser';
        mockEnv = { isDockerEnvironment: false, dataDirectory: undefined };
        mockGetEnv.mockReturnValue(mockEnv);

        const paths = Paths.initialize('/app', false); // Production mode

        expect(paths.dataDirectoryPath).toBe(path.join('/home/testuser', '.local', 'share', 'moartube-node'));
      });
    });
  });
});