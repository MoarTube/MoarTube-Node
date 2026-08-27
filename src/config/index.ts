/**
 * Centralized Configuration System
 * Main configuration singleton that coordinates all configuration subsystems
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { NodeSettings, NodeIdentification, LastCheckedContentTracker } from '@/types/index.js';
import { Logger } from '@/utils/index.js';

import { getEnv, type Env } from '@config/env.js';
import { initializePaths, type Paths, type PathConfig } from '@config/paths.js';
import {
  initializeUrls,
  buildNodeBaseUrl,
  buildExternalVideosBaseUrl,
  buildExternalResourcesBaseUrl,
  type Urls,
  type UrlConfig,
} from '@config/urls.js';
import {
  validateNodeSettings,
  validateAppConfig,
  validateNodeIdentification,
  validateLastCheckedContentTracker,
  type NodeSettingsValidated,
  type AppConfigValidated,
} from '@config/schema.js';

/**
 * Runtime configuration (not persisted)
 */
export interface RuntimeConfig {
  jwtSecret: string;
  isDockerEnvironment: boolean;
  isDevelopment: boolean;
}

/**
 * Main configuration singleton
 * Coordinates all configuration subsystems and provides unified access
 */
class Config {
  private static instance: Config | null = null;

  private readonly _env: Env;
  private readonly _paths: Paths;
  private readonly _urls: Urls;
  private readonly _appConfig: AppConfigValidated;
  private _nodeSettings: NodeSettingsValidated;
  private _nodeIdentification: NodeIdentification | null = null;
  private _lastCheckedContentTracker: LastCheckedContentTracker;
  private readonly _runtime: RuntimeConfig;
  private _nodeSettingsWatcher: fs.FSWatcher | null = null;
  private _lastCheckedContentTrackerWatcher: fs.FSWatcher | null = null;
  private readonly logger = Logger.getInstance();

  private constructor(baseDir: string, configFileName: string, entryPointDir?: string) {
    // Initialize environment first
    this._env = getEnv();

    // Load app config json file
    this._appConfig = this.loadAppConfig(baseDir, configFileName);

    // Initialize paths (needs isDevelopment to determine data directory location)
    // Pass entryPointDir to properly resolve public folder in bundled builds
    this._paths = initializePaths(baseDir, this._env.isDevelopment, entryPointDir);

    // Ensure data directories exist
    this.ensureDataDirectoriesExist();

    // Initialize URLs with indexer/aliaser configs
    this._urls = initializeUrls(this._appConfig.indexerConfig, this._appConfig.aliaserConfig);

    // Load node settings
    this._nodeSettings = this.loadNodeSettings();

    // Load node identification (may not exist)
    this._nodeIdentification = this.loadNodeIdentification();

    // Load content tracker
    this._lastCheckedContentTracker = this.loadLastCheckedContentTracker();

    // Set up file watching for tracker file
    this.setupTrackerFileWatcher();

    // Initialize runtime config
    this._runtime = {
      jwtSecret: '', // Set later via setJwtSecret
      isDockerEnvironment: this._env.isDockerEnvironment,
      isDevelopment: this._env.isDevelopment,
    };

    // Set up file watching for settings file
    this.setupSettingsFileWatcher();
  }

  /**
   * Set up file watcher for automatic settings reload
   */
  private setupSettingsFileWatcher(): void {
    this._nodeSettingsWatcher = fs.watch(this._paths.nodeSettingsPath, (eventType) => {
      if (eventType === 'change') {
        this.reloadNodeSettings();
      }
    });
  }

  /**
   * Set up file watcher for automatic content tracker reload
   */
  private setupTrackerFileWatcher(): void {
    this._lastCheckedContentTrackerWatcher = fs.watch(
      this._paths.lastCheckedContentTrackerPath,
      (eventType) => {
        if (eventType === 'change') {
          this.reloadLastCheckedContentTracker();
        }
      }
    );
  }

  /**
   * Initialize the configuration system
   * @param baseDir - Base directory where config files live
   * @param configFileName - Name of the config file to load
   * @param entryPointDir - Directory of the entry point (for bundled builds)
   */
  static initialize(baseDir: string, configFileName: string, entryPointDir?: string): Config {
    Config.instance ??= new Config(baseDir, configFileName, entryPointDir);

    return Config.instance;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): Config {
    if (!Config.instance) {
      throw new Error('Config not initialized. Call Config.initialize() first.');
    }
    return Config.instance;
  }

  // ============================================
  // Data Directory Setup
  // ============================================

  /**
   * Ensure all required data directories exist
   */
  private ensureDataDirectoriesExist(): void {
    fs.mkdirSync(this._paths.imagesDirectoryPath, { recursive: true });
    fs.mkdirSync(this._paths.videosDirectoryPath, { recursive: true });
    fs.mkdirSync(this._paths.databaseDirectoryPath, { recursive: true });
    fs.mkdirSync(this._paths.certificatesDirectoryPath, { recursive: true });
  }

  // ============================================
  // App Config (config.json)
  // ============================================

  private loadAppConfig(baseDir: string, configFileName: string): AppConfigValidated {
    const configPath = path.join(baseDir, configFileName);

    if (!fs.existsSync(configPath)) {
      throw new Error(`App config not found: ${configPath}`);
    }

    const rawConfig: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return validateAppConfig(rawConfig);
  }

  /**
   * Get app config (read-only)
   */
  get appConfig(): Readonly<AppConfigValidated> {
    return Object.freeze({ ...this._appConfig });
  }

  /**
   * Check if development mode is enabled (NODE_ENV=development)
   */
  get isDevelopment(): boolean {
    return this._env.isDevelopment;
  }

  // ============================================
  // Node Settings
  // ============================================

  private loadNodeSettings(): NodeSettingsValidated {
    const settingsPath = this._paths.nodeSettingsPath;

    if (!fs.existsSync(settingsPath)) {
      // Create default settings if they don't exist
      const defaultSettings = this.createDefaultNodeSettings();
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
      return validateNodeSettings(defaultSettings);
    }

    const rawSettings: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return validateNodeSettings(rawSettings);
  }

  /**
   * Create default node settings
   */
  private createDefaultNodeSettings(): Record<string, unknown> {
    return {
      nodeListeningPort: 9090,
      isSecure: false,
      publicNodeProtocol: '',
      publicNodeAddress: '',
      publicNodePort: '',
      nodeName: 'moartube node',
      nodeAbout: 'just a MoarTube node',
      nodeId: '',
      username: 'JDJhJDEwJHVrZUJsbmlvVzNjWEhGUGU0NjJrS09lSVVHc1VxeTJXVlJQbTNoL3hEM2VWTFRad0FiZVZL', // admin (Base64 encoded bcrypt hash)
      password: 'JDJhJDEwJHVkYUxudzNkLjRiYkExcVMwMnRNL09la3Q5Z3ZMQVpEa1JWMEVxd3RjU09wVXNTYXpTbXRX', // admin (Base64 encoded bcrypt hash)
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
  }

  /**
   * Get node settings (read-only)
   */
  get nodeSettings(): Readonly<NodeSettingsValidated> {
    return Object.freeze({ ...this._nodeSettings });
  }

  /**
   * Update node settings and persist to disk
   */
  updateNodeSettings(updates: Partial<NodeSettings>): void {
    const merged = { ...this._nodeSettings, ...updates };
    this._nodeSettings = validateNodeSettings(merged);
    this.persistNodeSettings();
  }

  /**
   * Reload node settings from disk
   * Useful when settings file has been manually edited
   */
  reloadNodeSettings(): void {
    this._nodeSettings = this.loadNodeSettings();
  }

  /**
   * Clean up resources (file watchers, etc.)
   */
  cleanup(): void {
    if (this._nodeSettingsWatcher) {
      this._nodeSettingsWatcher.close();
      this._nodeSettingsWatcher = null;
    }
    if (this._lastCheckedContentTrackerWatcher) {
      this._lastCheckedContentTrackerWatcher.close();
      this._lastCheckedContentTrackerWatcher = null;
    }
  }

  private persistNodeSettings(): void {
    fs.writeFileSync(this._paths.nodeSettingsPath, JSON.stringify(this._nodeSettings, null, 2));
  }

  // ============================================
  // Node Identification
  // ============================================

  private loadNodeIdentification(): NodeIdentification | null {
    const identPath = this._paths.nodeIdentificationPath;

    if (!fs.existsSync(identPath)) {
      return null;
    }

    try {
      const rawIdent: unknown = JSON.parse(fs.readFileSync(identPath, 'utf8'));
      return validateNodeIdentification(rawIdent);
    } catch {
      return null;
    }
  }

  /**
   * Get node identification (may be null if not yet created)
   */
  get nodeIdentification(): Readonly<NodeIdentification> | null {
    return this._nodeIdentification ? Object.freeze({ ...this._nodeIdentification }) : null;
  }

  /**
   * Set node identification and persist to disk
   */
  setNodeIdentification(identification: NodeIdentification): void {
    this._nodeIdentification = validateNodeIdentification(identification);
    fs.writeFileSync(this._paths.nodeIdentificationPath, JSON.stringify(this._nodeIdentification));
  }

  // ============================================
  // Last Checked Content Tracker
  // ============================================

  private loadLastCheckedContentTracker(): LastCheckedContentTracker {
    const trackerPath = this._paths.lastCheckedContentTrackerPath;

    if (!fs.existsSync(trackerPath)) {
      // Create and return defaults
      const defaults = {
        lastCheckedCommentsTimestamp: 0,
        lastCheckedVideoReportsTimestamp: 0,
        lastCheckedCommentReportsTimestamp: 0,
      };

      try {
        fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
        fs.writeFileSync(trackerPath, JSON.stringify(defaults));
      } catch (err) {
        this.logger.error('Failed to create default content tracker file', err);
      }

      return defaults;
    }

    const rawTracker: unknown = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    return validateLastCheckedContentTracker(rawTracker);
  }

  /**
   * Get last checked content tracker (read-only)
   */
  get lastCheckedContentTracker(): Readonly<LastCheckedContentTracker> {
    return Object.freeze({ ...this._lastCheckedContentTracker });
  }

  /**
   * Update content tracker and persist
   */
  updateLastCheckedContentTracker(updates: Partial<LastCheckedContentTracker>): void {
    this._lastCheckedContentTracker = {
      ...this._lastCheckedContentTracker,
      ...updates,
    };
    fs.writeFileSync(
      this._paths.lastCheckedContentTrackerPath,
      JSON.stringify(this._lastCheckedContentTracker)
    );
  }

  /**
   * Reload content tracker from disk
   */
  reloadLastCheckedContentTracker(): void {
    // We use loadLastCheckedContentTracker here, but since the file exists (we are watching it),
    // it will read from disk.
    // However, loadLastCheckedContentTracker has checks for existance.
    try {
      const trackerPath = this._paths.lastCheckedContentTrackerPath;
      if (fs.existsSync(trackerPath)) {
        const rawTracker: unknown = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        this._lastCheckedContentTracker = validateLastCheckedContentTracker(rawTracker);
      }
    } catch (error) {
      this.logger.error('Failed to reload content tracker', error);
    }
  }

  // ============================================
  // Runtime Config
  // ============================================

  /**
   * Get runtime config (read-only)
   */
  get runtime(): Readonly<RuntimeConfig> {
    return Object.freeze({ ...this._runtime });
  }

  /**
   * Get JWT secret
   */
  get jwtSecret(): string {
    return this._runtime.jwtSecret;
  }

  /**
   * Set JWT secret (called after receiving from master process)
   */
  setJwtSecret(secret: string): void {
    this._runtime.jwtSecret = secret;
  }

  /**
   * Generate a new JWT secret
   */
  static generateJwtSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Check if running in Docker
   */
  get isDockerEnvironment(): boolean {
    return this._runtime.isDockerEnvironment;
  }

  // ============================================
  // Subsystem Access
  // ============================================

  /**
   * Get environment configuration
   */
  get env(): Env {
    return this._env;
  }

  /**
   * Get paths configuration
   */
  get paths(): Paths {
    return this._paths;
  }

  /**
   * Get URLs configuration
   */
  get urls(): Urls {
    return this._urls;
  }

  // ============================================
  // URL Builders
  // ============================================

  /**
   * Get the node's public base URL
   */
  getNodeBaseUrl(): string {
    return buildNodeBaseUrl(this._nodeSettings as NodeSettings);
  }

  /**
   * Get external videos base URL
   */
  getExternalVideosBaseUrl(): string {
    return buildExternalVideosBaseUrl(this._nodeSettings as NodeSettings);
  }

  /**
   * Get external resources base URL
   */
  getExternalResourcesBaseUrl(): string {
    return buildExternalResourcesBaseUrl(this._nodeSettings as NodeSettings);
  }

  // ============================================
  // Summary
  // ============================================

  /**
   * Get a summary of all configuration (for debugging)
   */
  toSummary(): {
    env: ReturnType<Env['getAll']>;
    paths: PathConfig;
    urls: UrlConfig;
    isDevelopment: boolean;
    isDockerEnvironment: boolean;
    storageMode: string;
    databaseDialect: string;
  } {
    return {
      env: this._env.getAll(),
      paths: this._paths.toObject(),
      urls: this._urls.toObject(),
      isDevelopment: this._env.isDevelopment,
      isDockerEnvironment: this._runtime.isDockerEnvironment,
      storageMode: this._nodeSettings.storageConfig.storageMode,
      databaseDialect: this._nodeSettings.databaseConfig.databaseDialect,
    };
  }
}

/**
 * Initialize the configuration system
 * @param baseDir - Base directory where config files live
 * @param configFileName - Name of the config file to load
 * @param entryPointDir - Directory of the entry point (for bundled builds)
 */
export function initializeConfig(
  baseDir: string,
  configFileName: string,
  entryPointDir?: string
): Config {
  return Config.initialize(baseDir, configFileName, entryPointDir);
}

/**
 * Get the configuration singleton
 */
export function getConfig(): Config {
  return Config.getInstance();
}

/**
 * Export the Config class for testing
 */
export { Config };

// Re-export subsystem exports for convenience
export { getEnv } from '@config/env.js';
