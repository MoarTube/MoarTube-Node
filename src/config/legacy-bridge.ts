/**
 * Legacy Bridge for Configuration System
 * Provides backward compatibility with existing JavaScript code
 *
 * This module exports functions that match the existing API from utils/helpers.js,
 * utils/paths.js, and utils/urls.js, allowing gradual migration to the new Config system.
 *
 * Usage:
 * - Import from this module instead of the old utils modules
 * - Functions have the same signatures as the original implementations
 * - Internally delegates to the new Config singleton
 */

import { getConfig, Config } from './index';
import type { NodeSettings, LastCheckedContentTracker, NodeIdentification } from '../types';

// ============================================
// Path Getters (replaces utils/paths.js)
// ============================================

/**
 * @deprecated Use getConfig().paths.publicDirectoryPath instead
 */
export function getPublicDirectoryPath(): string {
  return getConfig().paths.publicDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.viewsDirectoryPath instead
 */
export function getViewsDirectoryPath(): string {
  return getConfig().paths.viewsDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.dataDirectoryPath instead
 */
export function getDataDirectoryPath(): string {
  return getConfig().paths.dataDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.nodeSettingsPath instead
 */
export function getNodeSettingsPath(): string {
  return getConfig().paths.nodeSettingsPath;
}

/**
 * @deprecated Use getConfig().paths.lastCheckedContentTrackerPath instead
 */
export function getLastCheckedContentTrackerPath(): string {
  return getConfig().paths.lastCheckedContentTrackerPath;
}

/**
 * @deprecated Use getConfig().paths.imagesDirectoryPath instead
 */
export function getImagesDirectoryPath(): string {
  return getConfig().paths.imagesDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.videosDirectoryPath instead
 */
export function getVideosDirectoryPath(): string {
  return getConfig().paths.videosDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.databaseDirectoryPath instead
 */
export function getDatabaseDirectoryPath(): string {
  return getConfig().paths.databaseDirectoryPath;
}

/**
 * @deprecated Use getConfig().paths.databaseFilePath instead
 */
export function getDatabaseFilePath(): string {
  return getConfig().paths.databaseFilePath;
}

/**
 * @deprecated Use getConfig().paths.certificatesDirectoryPath instead
 */
export function getCertificatesDirectoryPath(): string {
  return getConfig().paths.certificatesDirectoryPath;
}

// ============================================
// URL Getters (replaces utils/urls.js)
// ============================================

/**
 * @deprecated Use getConfig().urls.indexerUrl instead
 */
export function getMoarTubeIndexerUrl(): string {
  return getConfig().urls.indexerUrl;
}

/**
 * @deprecated Use getConfig().urls.aliaserUrl instead
 */
export function getMoarTubeAliaserUrl(): string {
  return getConfig().urls.aliaserUrl;
}

/**
 * @deprecated Use getConfig().urls.getIndexerConfig() instead
 */
export function getMoarTubeIndexerHttpProtocol(): string {
  return getConfig().urls.getIndexerConfig().httpProtocol;
}

/**
 * @deprecated Use getConfig().urls.getIndexerConfig() instead
 */
export function getMoarTubeIndexerIp(): string {
  return getConfig().urls.getIndexerConfig().host;
}

/**
 * @deprecated Use getConfig().urls.getIndexerConfig() instead
 */
export function getMoarTubeIndexerPort(): number {
  return getConfig().urls.getIndexerConfig().port;
}

/**
 * @deprecated Use getConfig().urls.getAliaserConfig() instead
 */
export function getMoarTubeAliaserHttpProtocol(): string {
  return getConfig().urls.getAliaserConfig().httpProtocol;
}

/**
 * @deprecated Use getConfig().urls.getAliaserConfig() instead
 */
export function getMoarTubeAliaserIp(): string {
  return getConfig().urls.getAliaserConfig().host;
}

/**
 * @deprecated Use getConfig().urls.getAliaserConfig() instead
 */
export function getMoarTubeAliaserPort(): number {
  return getConfig().urls.getAliaserConfig().port;
}

/**
 * @deprecated Use getConfig().urls.cloudflareZoneUrl instead
 */
export function getCloudflareZoneUrl(): string {
  return getConfig().urls.cloudflareZoneUrl;
}

// ============================================
// Node Settings (replaces utils/helpers.js getters/setters)
// ============================================

/**
 * @deprecated Use getConfig().nodeSettings instead
 */
export function getNodeSettings(): NodeSettings {
  return getConfig().nodeSettings as NodeSettings;
}

/**
 * @deprecated Use getConfig().updateNodeSettings() instead
 */
export function setNodeSettings(settings: NodeSettings): void {
  getConfig().updateNodeSettings(settings);
}

/**
 * @deprecated Use getConfig().lastCheckedContentTracker instead
 */
export function getLastCheckedContentTracker(): LastCheckedContentTracker {
  return getConfig().lastCheckedContentTracker as LastCheckedContentTracker;
}

/**
 * @deprecated Use getConfig().updateLastCheckedContentTracker() instead
 */
export function setLastCheckedContentTracker(tracker: LastCheckedContentTracker): void {
  getConfig().updateLastCheckedContentTracker(tracker);
}

/**
 * @deprecated Use getConfig().nodeIdentification instead
 */
export function getNodeIdentification(): NodeIdentification | null {
  return getConfig().nodeIdentification as NodeIdentification | null;
}

/**
 * @deprecated Use getConfig().setNodeIdentification() instead
 */
export function setNodeIdentification(identification: NodeIdentification): void {
  getConfig().setNodeIdentification(identification);
}

// ============================================
// Runtime Config (replaces utils/helpers.js runtime getters/setters)
// ============================================

/**
 * @deprecated Use getConfig().jwtSecret instead
 */
export function getJwtSecret(): string {
  return getConfig().jwtSecret;
}

/**
 * @deprecated Use getConfig().setJwtSecret() instead
 */
export function setJwtSecret(secret: string): void {
  getConfig().setJwtSecret(secret);
}

/**
 * @deprecated Use getConfig().isDockerEnvironment instead
 */
export function getIsDockerEnvironment(): boolean {
  return getConfig().isDockerEnvironment;
}

/**
 * @deprecated Use getConfig().isDeveloperMode instead
 */
export function getIsDeveloperMode(): boolean {
  return getConfig().isDeveloperMode;
}

/**
 * @deprecated Use getConfig().runtime.expressSessionName instead
 */
export function getExpressSessionName(): string {
  return getConfig().runtime.expressSessionName;
}

/**
 * @deprecated Use getConfig().runtime.expressSessionSecret instead
 */
export function getExpressSessionSecret(): string {
  return getConfig().runtime.expressSessionSecret;
}

// ============================================
// URL Builders (replaces utils/helpers.js URL functions)
// ============================================

/**
 * @deprecated Use getConfig().getNodeBaseUrl() instead
 */
export function getNodeBaseUrl(): string {
  return getConfig().getNodeBaseUrl();
}

/**
 * @deprecated Use getConfig().getExternalVideosBaseUrl() instead
 */
export function getExternalVideosBaseUrl(): string {
  return getConfig().getExternalVideosBaseUrl();
}

/**
 * @deprecated Use getConfig().getExternalResourcesBaseUrl() instead
 */
export function getExternalResourcesBaseUrl(): string {
  return getConfig().getExternalResourcesBaseUrl();
}

// ============================================
// Initialization Helper
// ============================================

/**
 * Initialize the legacy bridge by ensuring the Config singleton is ready
 * This should be called at application startup before using any legacy functions
 *
 * @deprecated Use initializeConfig() from './index' directly
 */
export function initializeLegacyBridge(baseDir: string): void {
  if (!Config.isInitialized()) {
    Config.initialize(baseDir);
  }
}
