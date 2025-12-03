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
} from '../types/index.js';

import { getEnv, type Env } from './env.js';
import { initializePaths, type Paths, type PathConfig } from './paths.js';
import {
  initializeUrls,
  buildNodeBaseUrl,
  buildExternalVideosBaseUrl,
  buildExternalResourcesBaseUrl,
  type Urls,
  type UrlConfig,
} from './urls.js';
import {
  validateNodeSettings,
  validateAppConfig,
  validateNodeIdentification,
  validateLastCheckedContentTracker,
  type NodeSettingsValidated,
  type AppConfigValidated,
} from './schema.js';

/**
 * Runtime configuration (not persisted)
 */
export interface RuntimeConfig {
  jwtSecret: string;
  isDockerEnvironment: boolean;
  isDeveloperMode: boolean;
  expressSessionName: string;
  expressSessionSecret: string;
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

  private constructor(baseDir: string) {
    // Initialize environment first
    this._env = getEnv();

    // Initialize paths
    this._paths = initializePaths(baseDir);

    // Load app config (config.json)
    this._appConfig = this.loadAppConfig(baseDir);

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
      expressSessionName: this._nodeSettings.expressSessionName,
      expressSessionSecret: this._nodeSettings.expressSessionSecret,
    };
  }

  /**
   * Initialize the configuration system
   */
  static initialize(baseDir: string): Config {
    Config.instance ??= new Config(baseDir);
    return Config.instance;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): Config {
    if (Config.instance === undefined) {
      throw new Error('Config not initialized. Call Config.initialize(baseDir) first.');
    }
    return Config.instance;
  }

  /**
   * Check if config has been initialized
   */
  static isInitialized(): boolean {
    return Config.instance !== undefined;
  }

  // ============================================
  // App Config (config.json)
  // ============================================

  private loadAppConfig(baseDir: string): AppConfigValidated {
    const configPath = path.join(baseDir, 'config.json');

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
      throw new Error(`Node settings not found: ${settingsPath}`);
    }

    const rawSettings: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return validateNodeSettings(rawSettings);
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

    // Update runtime config if session credentials changed
    if (updates.expressSessionName !== undefined && updates.expressSessionName !== '') {
      this._runtime.expressSessionName = this._nodeSettings.expressSessionName;
    }
    if (updates.expressSessionSecret !== undefined && updates.expressSessionSecret !== '') {
      this._runtime.expressSessionSecret = this._nodeSettings.expressSessionSecret;
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
export function initializeConfig(baseDir: string): Config {
  return Config.initialize(baseDir);
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
export { getEnv } from './env.js';
export { getPaths, type PathConfig } from './paths.js';
export { getUrls, type UrlConfig } from './urls.js';
