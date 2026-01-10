/**
 * Path configuration module
 * Centralized management of all file and directory paths used by the application
 */

import path from 'node:path';
import { getEnv } from '@config/env.js';

/**
 * Path configuration interface
 */
export interface PathConfig {
  // Base directories
  readonly publicDirectoryPath: string;
  readonly dataDirectoryPath: string;
  readonly viewsDirectoryPath: string;

  // Data subdirectories
  readonly imagesDirectoryPath: string;
  readonly videosDirectoryPath: string;
  readonly databaseDirectoryPath: string;
  readonly certificatesDirectoryPath: string;

  // Config files
  readonly nodeSettingsPath: string;
  readonly nodeIdentificationPath: string;
  readonly lastCheckedContentTrackerPath: string;
  readonly databaseFilePath: string;
}

/**
 * Path configuration singleton class
 */
class Paths implements PathConfig {
  private static instance: Paths | undefined;

  // Base directories
  readonly publicDirectoryPath: string;
  readonly dataDirectoryPath: string;
  readonly viewsDirectoryPath: string;

  // Data subdirectories
  readonly imagesDirectoryPath: string;
  readonly videosDirectoryPath: string;
  readonly databaseDirectoryPath: string;
  readonly certificatesDirectoryPath: string;

  // Config files
  readonly nodeSettingsPath: string;
  readonly nodeIdentificationPath: string;
  readonly lastCheckedContentTrackerPath: string;
  readonly databaseFilePath: string;

  private constructor(baseDir: string, isDeveloperMode: boolean) {
    const env = getEnv();

    // Base directories
    this.publicDirectoryPath = path.join(baseDir, 'public');
    this.viewsDirectoryPath = path.join(this.publicDirectoryPath, 'views');

    // Data directory priority:
    // 1. MOARTUBE_DATA_DIR environment variable (explicit override)
    // 2. Docker environment (/data volume)
    // 3. Developer mode (local ./data directory)
    // 4. Production (OS-specific user data directory)
    this.dataDirectoryPath = this.resolveDataDirectory(baseDir, isDeveloperMode, env);

    // Data subdirectories
    this.imagesDirectoryPath = path.join(this.dataDirectoryPath, 'images');
    this.videosDirectoryPath = path.join(this.dataDirectoryPath, 'media', 'videos');
    this.databaseDirectoryPath = path.join(this.dataDirectoryPath, 'db');
    this.certificatesDirectoryPath = path.join(this.dataDirectoryPath, 'certificates');

    // Config files
    this.nodeSettingsPath = path.join(this.dataDirectoryPath, '_node_settings.json');
    this.nodeIdentificationPath = path.join(this.dataDirectoryPath, '_node_identification.json');
    this.lastCheckedContentTrackerPath = path.join(
      this.dataDirectoryPath,
      '_last_checked_content_tracker.json'
    );
    this.databaseFilePath = path.join(this.databaseDirectoryPath, 'node_db.sqlite');
  }

  /**
   * Resolve the data directory path based on priority order:
   * 1. MOARTUBE_DATA_DIR environment variable
   * 2. Docker environment
   * 3. Developer mode
   * 4. OS-specific user data directory
   */
  private resolveDataDirectory(
    baseDir: string,
    isDeveloperMode: boolean,
    env: ReturnType<typeof getEnv>
  ): string {
    // Priority 1: Explicit environment variable override
    const envDataDir = env.dataDirectory;
    if (envDataDir !== undefined && envDataDir !== '') {
      return envDataDir;
    }

    // Priority 2: Docker environment uses /data volume
    if (env.isDockerEnvironment) {
      return '/data';
    }

    // Priority 3: Developer mode uses local ./data directory
    if (isDeveloperMode) {
      return path.join(baseDir, 'data');
    }

    // Priority 4: Production uses OS-specific user data directory
    return this.getOsSpecificDataDirectory();
  }

  /**
   * Get the OS-specific user data directory
   * - Windows: %APPDATA%/moartube-node
   * - macOS: ~/Library/Application Support/moartube-node
   * - Linux: ~/.local/share/moartube-node
   */
  private getOsSpecificDataDirectory(): string {
    const appName = 'moartube-node';

    if (process.platform === 'win32') {
      const appData = process.env['APPDATA'];
      if (appData === undefined || appData === '') {
        throw new Error(
          'APPDATA environment variable is not set. ' +
          'Set MOARTUBE_DATA_DIR environment variable to specify the data directory.'
        );
      }
      return path.join(appData, appName);
    }

    if (process.platform === 'darwin') {
      const home = process.env['HOME'];
      if (home === undefined || home === '') {
        throw new Error(
          'HOME environment variable is not set. ' +
          'Set MOARTUBE_DATA_DIR environment variable to specify the data directory.'
        );
      }
      return path.join(home, 'Library', 'Application Support', appName);
    }

    // Linux and other Unix-like systems
    const home = process.env['HOME'];
    if (home === undefined || home === '') {
      throw new Error(
        'HOME environment variable is not set. ' +
        'Set MOARTUBE_DATA_DIR environment variable to specify the data directory.'
      );
    }
    return path.join(home, '.local', 'share', appName);
  }

  /**
   * Initialize the paths singleton with the application base directory
   */
  static initialize(baseDir: string, isDeveloperMode: boolean): Paths {
    Paths.instance ??= new Paths(baseDir, isDeveloperMode);
    return Paths.instance;
  }

  /**
   * Get the singleton instance
   * @throws Error if not initialized
   */
  static getInstance(): Paths {
    if (!Paths.instance) {
      throw new Error('Paths not initialized. Call Paths.initialize(baseDir) first.');
    }
    return Paths.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    Paths.instance = undefined;
  }

  /**
   * Check if the paths have been initialized
   */
  static isInitialized(): boolean {
    return Paths.instance !== undefined;
  }

  /**
   * Get video directory path for a specific video
   */
  getVideoDirectoryPath(videoId: string): string {
    return path.join(this.videosDirectoryPath, videoId);
  }

  /**
   * Get video images directory path for a specific video
   */
  getVideoImagesDirectoryPath(videoId: string): string {
    return path.join(this.getVideoDirectoryPath(videoId), 'images');
  }

  /**
   * Get video adaptive directory path for a specific video
   */
  getVideoAdaptiveDirectoryPath(videoId: string): string {
    return path.join(this.getVideoDirectoryPath(videoId), 'adaptive');
  }

  /**
   * Get video progressive directory path for a specific video
   */
  getVideoProgressiveDirectoryPath(videoId: string): string {
    return path.join(this.getVideoDirectoryPath(videoId), 'progressive');
  }

  /**
   * Get thumbnail image path for a specific video
   */
  getVideoThumbnailPath(videoId: string): string {
    return path.join(this.getVideoImagesDirectoryPath(videoId), 'thumbnail.jpg');
  }

  /**
   * Get preview image path for a specific video
   */
  getVideoPreviewPath(videoId: string): string {
    return path.join(this.getVideoImagesDirectoryPath(videoId), 'preview.jpg');
  }

  /**
   * Get poster image path for a specific video
   */
  getVideoPosterPath(videoId: string): string {
    return path.join(this.getVideoImagesDirectoryPath(videoId), 'poster.jpg');
  }

  /**
   * Get custom icon path (data/images/icon.png)
   */
  getCustomIconPath(): string {
    return path.join(this.imagesDirectoryPath, 'icon.png');
  }

  /**
   * Get default icon path (public/images/icon.png)
   */
  getDefaultIconPath(): string {
    return path.join(this.publicDirectoryPath, 'images', 'icon.png');
  }

  /**
   * Get custom avatar path (data/images/avatar.png)
   */
  getCustomAvatarPath(): string {
    return path.join(this.imagesDirectoryPath, 'avatar.png');
  }

  /**
   * Get default avatar path (public/images/avatar.png)
   */
  getDefaultAvatarPath(): string {
    return path.join(this.publicDirectoryPath, 'images', 'avatar.png');
  }

  /**
   * Get custom banner path (data/images/banner.png)
   */
  getCustomBannerPath(): string {
    return path.join(this.imagesDirectoryPath, 'banner.png');
  }

  /**
   * Get default banner path (public/images/banner.png)
   */
  getDefaultBannerPath(): string {
    return path.join(this.publicDirectoryPath, 'images', 'banner.png');
  }

  /**
   * Get all paths as a plain object
   */
  toObject(): PathConfig {
    return {
      publicDirectoryPath: this.publicDirectoryPath,
      dataDirectoryPath: this.dataDirectoryPath,
      viewsDirectoryPath: this.viewsDirectoryPath,
      imagesDirectoryPath: this.imagesDirectoryPath,
      videosDirectoryPath: this.videosDirectoryPath,
      databaseDirectoryPath: this.databaseDirectoryPath,
      certificatesDirectoryPath: this.certificatesDirectoryPath,
      nodeSettingsPath: this.nodeSettingsPath,
      nodeIdentificationPath: this.nodeIdentificationPath,
      lastCheckedContentTrackerPath: this.lastCheckedContentTrackerPath,
      databaseFilePath: this.databaseFilePath,
    };
  }
}

/**
 * Export initializer
 */
export function initializePaths(baseDir: string, isDeveloperMode: boolean): Paths {
  return Paths.initialize(baseDir, isDeveloperMode);
}

/**
 * Export the Paths class for testing purposes
 */
export { Paths };
