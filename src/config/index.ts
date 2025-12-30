/**
 * Centralized Configuration System
 * Main configuration singleton that coordinates all configuration subsystems
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type {
  NodeSettings,
  NodeIdentification,
  LastCheckedContentTracker,
} from '@/types/index.js';

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
  isDeveloperMode: boolean;
}

/**
 * Main configuration singleton
 * Coordinates all configuration subsystems and provides unified access
 */
class Config {
  private static instance: Config;

  private readonly _env: Env;
  private readonly _paths: Paths;
  private readonly _urls: Urls;
  private readonly _appConfig: AppConfigValidated;
  private _nodeSettings: NodeSettingsValidated;
  private _nodeIdentification: NodeIdentification | null = null;
  private _lastCheckedContentTracker: LastCheckedContentTracker;
  private readonly _runtime: RuntimeConfig;
  private _settingsWatcher: fs.FSWatcher | null = null;

  private constructor(baseDir: string, configFileName: string) {
    // Initialize environment first
    this._env = getEnv();

    // Initialize paths
    this._paths = initializePaths(baseDir);

    // Ensure data directories exist
    this.ensureDataDirectoriesExist();

    // Load app config json file
    this._appConfig = this.loadAppConfig(baseDir, configFileName);

    // Initialize URLs with indexer/aliaser configs
    this._urls = initializeUrls(this._appConfig.indexerConfig, this._appConfig.aliaserConfig);

    // Load node settings
    this._nodeSettings = this.loadNodeSettings();

    // Load node identification (may not exist)
    this._nodeIdentification = this.loadNodeIdentification();

    // Load content tracker
    this._lastCheckedContentTracker = this.loadLastCheckedContentTracker();

    // Initialize runtime config
    this._runtime = {
      jwtSecret: '', // Set later via setJwtSecret
      isDockerEnvironment: this._env.isDockerEnvironment,
      isDeveloperMode: this._appConfig.isDeveloperMode,
    };

    // Set up file watching for settings file
    this.setupSettingsFileWatcher();
  }

  /**
   * Set up file watcher for automatic settings reload
   */
  private setupSettingsFileWatcher(): void {
    this._settingsWatcher = fs.watch(this._paths.nodeSettingsPath, (eventType) => {
      if (eventType === 'change') {
        this.reloadNodeSettings();
      }
    });
  }

  /**
   * Initialize the configuration system
   */
  static initialize(baseDir: string, configFileName: string): Config {
    Config.instance = new Config(baseDir, configFileName);

    return Config.instance;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): Config {
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
   * Check if developer mode is enabled
   */
  get isDeveloperMode(): boolean {
    return this._appConfig.isDeveloperMode;
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
      nodeListeningPort: 80,
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
    if (this._settingsWatcher) {
      this._settingsWatcher.close();
      this._settingsWatcher = null;
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
      // Return defaults
      return {
        lastCheckedCommentsTimestamp: 0,
        lastCheckedVideoReportsTimestamp: 0,
        lastCheckedCommentReportsTimestamp: 0,
      };
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
    isDeveloperMode: boolean;
    isDockerEnvironment: boolean;
    storageMode: string;
    databaseDialect: string;
  } {
    return {
      env: this._env.getAll(),
      paths: this._paths.toObject(),
      urls: this._urls.toObject(),
      isDeveloperMode: this._appConfig.isDeveloperMode,
      isDockerEnvironment: this._runtime.isDockerEnvironment,
      storageMode: this._nodeSettings.storageConfig.storageMode,
      databaseDialect: this._nodeSettings.databaseConfig.databaseDialect,
    };
  }
}

/**
 * Initialize the configuration system
 */
export function initializeConfig(baseDir: string, configFileName: string): Config {
  return Config.initialize(baseDir, configFileName);
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
