/**
 * Settings Service
 *
 * Service layer for node settings management including configuration,
 * personalization, and system settings.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BaseService } from './base.js';
import type { ILogger } from '../utils/logger.js';
import type {
  ISettingsService,
  UpdateNodeSettingsInput,
  DatabaseConfigInput,
  StorageConfigInput,
  IIndexerService,
  ICloudflareService,
} from './interfaces.js';
import { getConfig } from '../config/index.js';
import type { DatabaseConfig, StorageConfig } from '../types/index.js';

/**
 * Settings service dependencies
 */
export interface SettingsServiceDependencies {
  indexerService?: IIndexerService;
  cloudflareService?: ICloudflareService;
}

/**
 * SettingsService class
 *
 * Handles all node settings and configuration management:
 * - Reading and updating node settings
 * - Managing node identity (name, about, avatar, banner)
 * - Database and storage configuration
 * - Cloudflare integration settings
 * - Node identification with MoarTube network
 */
export class SettingsService extends BaseService implements ISettingsService {
  private readonly indexerService: IIndexerService | undefined;
  private readonly cloudflareService: ICloudflareService | undefined;

  constructor(
    logger: ILogger,
    indexerService?: IIndexerService,
    cloudflareService?: ICloudflareService
  ) {
    super('SettingsService', logger);
    this.indexerService = indexerService;
    this.cloudflareService = cloudflareService;
  }

  /**
   * Get all node settings
   */
  getNodeSettings(): Record<string, unknown> {
    const config = getConfig();
    return config.nodeSettings as unknown as Record<string, unknown>;
  }

  /**
   * Get node version
   */
  getVersion(): string {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson: { version?: string } = JSON.parse(packageJsonContent) as {
        version?: string;
      };
      return packageJson.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Update node settings
   */
  updateNodeSettings(data: UpdateNodeSettingsInput): void {
    const config = getConfig();

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (data.nodeName !== undefined) {
      updates['nodeName'] = data.nodeName;
    }
    if (data.nodeAbout !== undefined) {
      updates['nodeAbout'] = data.nodeAbout;
    }
    if (data.nodeId !== undefined) {
      updates['nodeId'] = data.nodeId;
    }
    if (data.publicNodeProtocol !== undefined) {
      updates['publicNodeProtocol'] = data.publicNodeProtocol;
    }
    if (data.publicNodeAddress !== undefined) {
      updates['publicNodeAddress'] = data.publicNodeAddress;
    }
    if (data.publicNodePort !== undefined) {
      updates['publicNodePort'] = data.publicNodePort;
    }
    if (data.isSecure !== undefined) {
      updates['isSecure'] = data.isSecure;
    }
    if (data.isReportsEnabled !== undefined) {
      updates['isReportsEnabled'] = data.isReportsEnabled;
    }
    if (data.isCloudflareTurnstileEnabled !== undefined) {
      updates['isCloudflareTurnstileEnabled'] = data.isCloudflareTurnstileEnabled;
    }
    if (data.cloudflareTurnstileSiteKey !== undefined) {
      updates['cloudflareTurnstileSiteKey'] = data.cloudflareTurnstileSiteKey;
    }
    if (data.cloudflareTurnstileSecretKey !== undefined) {
      updates['cloudflareTurnstileSecretKey'] = data.cloudflareTurnstileSecretKey;
    }

    config.updateNodeSettings(updates);

    this.logger.info('Node settings updated', { fields: Object.keys(updates) });
  }

  /**
   * Update node name
   * Only updates indexer if there are indexed videos and performs node identification first
   */
  async updateNodeName(name: string, hasIndexedVideos: boolean = false): Promise<void> {
    const config = getConfig();

    config.updateNodeSettings({ nodeName: name });

    // Update in indexer if there are indexed videos
    if (hasIndexedVideos && this.indexerService) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeName(name);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService?.isEnabled() === true) {
          await this.cloudflareService.purgeNodePage();
        }
      } catch (error) {
        this.logger.error('Failed to update node name in indexer', error);
        throw error;
      }
    }

    this.logger.info('Node name updated', { name });
  }

  /**
   * Update node about
   * Only updates indexer if there are indexed videos and performs node identification first
   */
  async updateNodeAbout(about: string, hasIndexedVideos: boolean = false): Promise<void> {
    const config = getConfig();
    config.updateNodeSettings({ nodeAbout: about });

    // Update in indexer if there are indexed videos
    if (hasIndexedVideos && this.indexerService) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeAbout(about);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService?.isEnabled() === true) {
          await this.cloudflareService.purgeNodePage();
        }
      } catch (error) {
        this.logger.error('Failed to update node about in indexer', error);

        throw error;
      }
    }

    this.logger.info('Node about updated');
  }

  /**
   * Update node ID
   * Only updates indexer if there are indexed videos and performs node identification first
   */
  async updateNodeId(nodeId: string, hasIndexedVideos: boolean = false): Promise<void> {
    // Update in indexer first if there are indexed videos
    if (hasIndexedVideos && this.indexerService) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeId(nodeId);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService?.isEnabled() === true) {
          await this.cloudflareService.purgeNodePage();
        }
      } catch (error) {
        this.logger.error('Failed to update node ID in indexer', error);
        throw error;
      }
    }

    // Update local config after successful indexer update (or if no indexer update needed)
    const config = getConfig();
    config.updateNodeSettings({ nodeId });

    this.logger.info('Node ID updated', { nodeId });
  }

  /**
   * Update account credentials
   */
  async updateCredentials(username: string, password: string): Promise<void> {
    return this.withErrorLogging('updateCredentials', async () => {
      // Import bcrypt for hashing
      const bcryptjs = await import('bcryptjs');
      const saltRounds = 10;

      // Hash credentials
      const usernameHash = await bcryptjs.hash(username, saltRounds);
      const passwordHash = await bcryptjs.hash(password, saltRounds);

      // Encode as base64
      const encodedUsername = encodeURIComponent(
        Buffer.from(usernameHash, 'utf8').toString('base64')
      );
      const encodedPassword = encodeURIComponent(
        Buffer.from(passwordHash, 'utf8').toString('base64')
      );

      const config = getConfig();
      config.updateNodeSettings({
        username: encodedUsername,
        password: encodedPassword,
      });

      this.logger.info('Credentials updated');
    });
  }

  /**
   * Update network settings
   * Only updates indexer if there are indexed videos and performs node identification first
   */
  async updateNetworkSettings(
    protocol: string,
    address: string,
    port: string,
    hasIndexedVideos: boolean = false
  ): Promise<void> {
    // Update in indexer first if there are indexed videos
    if (hasIndexedVideos && this.indexerService) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        // Pass the new network values to the indexer (NOT the old config values)
        await this.indexerService.updateExternalNetwork(protocol, address, port);
      } catch (error) {
        this.logger.error('Failed to update network in indexer', error);
        throw error;
      }
    }

    // Then update local config
    const config = getConfig();
    config.updateNodeSettings({
      publicNodeProtocol: protocol as '' | 'http' | 'https',
      publicNodeAddress: address,
      publicNodePort: port,
    });

    this.logger.info('Network settings updated', { protocol, address, port });
  }

  /**
   * Update database configuration
   */
  updateDatabaseConfig(dbConfig: DatabaseConfigInput): void {
    const config = getConfig();

    const databaseConfig: DatabaseConfig = {
      databaseDialect: dbConfig.dialect,
    };

    if (
      dbConfig.dialect === 'postgres' &&
      dbConfig.postgresHost !== undefined &&
      dbConfig.postgresHost !== ''
    ) {
      databaseConfig.postgresConfig = {
        host: dbConfig.postgresHost,
        port: dbConfig.postgresPort ?? 5432,
        databaseName: dbConfig.postgresDatabase ?? '',
        username: dbConfig.postgresUser ?? '',
        password: dbConfig.postgresPassword ?? '',
      };
    }

    config.updateNodeSettings({ databaseConfig });

    this.logger.info('Database configuration updated', { dialect: dbConfig.dialect });
  }

  /**
   * Update storage configuration
   */
  updateStorageConfig(storageConfig: StorageConfigInput): void {
    const config = getConfig();

    const newStorageConfig: StorageConfig = {
      storageMode: storageConfig.storageMode,
    };

    if (
      storageConfig.storageMode === 's3provider' &&
      storageConfig.s3BucketName !== undefined &&
      storageConfig.s3BucketName !== ''
    ) {
      const s3ProviderClientConfig: {
        forcePathStyle: boolean;
        region: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
        endpoint?: string;
      } = {
        forcePathStyle: true,
        region: storageConfig.s3Region ?? 'us-east-1',
        credentials: {
          accessKeyId: storageConfig.s3AccessKeyId ?? '',
          secretAccessKey: storageConfig.s3SecretAccessKey ?? '',
        },
      };

      if (storageConfig.s3Endpoint !== undefined && storageConfig.s3Endpoint !== '') {
        s3ProviderClientConfig.endpoint = storageConfig.s3Endpoint;
      }

      newStorageConfig.s3Config = {
        bucketName: storageConfig.s3BucketName,
        s3ProviderClientConfig,
      };
    }

    config.updateNodeSettings({ storageConfig: newStorageConfig });

    this.logger.info('Storage configuration updated', { mode: storageConfig.storageMode });
  }

  /**
   * Update Cloudflare configuration
   */
  updateCloudflareConfig(
    emailAddress: string,
    authenticationKey: string,
    _accountId: string,
    zoneId: string,
    _zoneName: string
  ): void {
    const config = getConfig();

    config.updateNodeSettings({
      isCloudflareCdnEnabled: true,
      cloudflareEmailAddress: emailAddress,
      cloudflareGlobalApiKey: authenticationKey,
      cloudflareZoneId: zoneId,
    });

    this.logger.info('Cloudflare configuration updated');
  }

  /**
   * Clear Cloudflare configuration
   */
  clearCloudflareConfig(): void {
    const config = getConfig();

    config.updateNodeSettings({
      isCloudflareCdnEnabled: false,
      cloudflareEmailAddress: '',
      cloudflareGlobalApiKey: '',
      cloudflareZoneId: '',
    });

    this.logger.info('Cloudflare configuration cleared');
  }

  /**
   * Get avatar image stream
   */
  getAvatarFilePath(): string | null {
    try {
      const config = getConfig();

      const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'avatar.png');
      const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'avatar.png');

      const imagePath = fs.existsSync(customPath) ? customPath : defaultPath;

      if (fs.existsSync(imagePath)) {
        return imagePath;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update avatar and icon
   */
  async updateAvatar(iconFile: string, avatarFile: string): Promise<void> {
    return this.withErrorLogging('updateAvatar', async () => {
      const config = getConfig();
      const imagesDir = path.join(config.paths.dataDirectoryPath, 'images');

      // Ensure directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Move/copy icon file
      if (fs.existsSync(iconFile)) {
        const destPath = path.join(imagesDir, 'icon.png');
        fs.copyFileSync(iconFile, destPath);
      }

      // Move/copy avatar file
      if (fs.existsSync(avatarFile)) {
        const destPath = path.join(imagesDir, 'avatar.png');
        fs.copyFileSync(avatarFile, destPath);
      }

      // Purge cache if Cloudflare enabled
      if (this.cloudflareService?.isEnabled() === true) {
        await this.cloudflareService.purgeNodeImages();
      }

      this.logger.info('Avatar updated');
    });
  }

  /**
   * Get banner image stream
   */
  getBannerFilePath(): string | null {
    try {
      const config = getConfig();

      const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'banner.png');
      const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'banner.png');

      const imagePath = fs.existsSync(customPath) ? customPath : defaultPath;

      if (fs.existsSync(imagePath)) {
        return imagePath;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update banner
   */
  async updateBanner(bannerFile: string): Promise<void> {
    return this.withErrorLogging('updateBanner', async () => {
      const config = getConfig();
      const imagesDir = path.join(config.paths.dataDirectoryPath, 'images');

      // Ensure directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Move/copy banner file
      if (fs.existsSync(bannerFile)) {
        const destPath = path.join(imagesDir, 'banner.png');
        fs.copyFileSync(bannerFile, destPath);
      }

      // Purge cache if Cloudflare enabled
      if (this.cloudflareService?.isEnabled() === true) {
        await this.cloudflareService.purgeNodeImages();
      }

      this.logger.info('Banner updated');
    });
  }

  /**
   * Perform node identification
   */
  async performNodeIdentification(): Promise<void> {
    if (this.indexerService) {
      await this.indexerService.performNodeIdentification();
    } else {
      this.logger.warn('Indexer service not available for node identification');
    }
  }

  /**
   * Get node identification
   */
  getNodeIdentification(): Record<string, unknown> {
    const config = getConfig();
    return config.nodeIdentification as Record<string, unknown>;
  }

  /**
   * Check if node is in developer mode
   */
  isDeveloperMode(): boolean {
    const config = getConfig();
    return config.isDeveloperMode;
  }

  /**
   * Check if running in Docker
   */
  isDockerEnvironment(): boolean {
    const config = getConfig();
    return config.isDockerEnvironment;
  }

  /**
   * Get node icon as base64
   */
  getNodeIconBase64(): string {
    try {
      const config = getConfig();
      const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'icon.png');
      const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'icon.png');

      const imagePath = fs.existsSync(customPath) ? customPath : defaultPath;

      if (fs.existsSync(imagePath)) {
        return fs.readFileSync(imagePath).toString('base64');
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Get node avatar as base64
   */
  getNodeAvatarBase64(): string {
    try {
      const config = getConfig();
      const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'avatar.png');
      const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'avatar.png');

      const imagePath = fs.existsSync(customPath) ? customPath : defaultPath;

      if (fs.existsSync(imagePath)) {
        return fs.readFileSync(imagePath).toString('base64');
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Get node banner as base64
   */
  getNodeBannerBase64(): string {
    try {
      const config = getConfig();
      const customPath = path.join(config.paths.dataDirectoryPath, 'images', 'banner.png');
      const defaultPath = path.join(config.paths.publicDirectoryPath, 'images', 'banner.png');

      const imagePath = fs.existsSync(customPath) ? customPath : defaultPath;

      if (fs.existsSync(imagePath)) {
        return fs.readFileSync(imagePath).toString('base64');
      }

      return '';
    } catch {
      return '';
    }
  }
}
