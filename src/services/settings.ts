/**
 * Settings Service
 *
 * Service layer for node settings management including configuration,
 * personalization, and system settings.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { UpdateNodeSettingsInput } from '@services/interfaces.js';
import { getConfig } from '@config/index.js';
import type { DatabaseConfig, StorageConfig } from '@/types/index.js';
import type {
  IVideosRepository,
  ICommentsRepository,
  IReportsVideosRepository,
  IReportsCommentsRepository,
  IReportsArchiveVideosRepository,
  IReportsArchiveCommentsRepository,
  ILiveChatMessagesRepository,
  IMonetizationRepository,
  ILinksRepository,
  SQLiteVideo,
  SQLiteComment,
  SQLiteVideoReport,
  SQLiteCommentReport,
  SQLiteVideoReportArchive,
  SQLiteCommentReportArchive,
  SQLiteLiveChatMessage,
  SQLiteCryptoWalletAddress,
  SQLiteLink,
  SQLiteNewVideo,
  SQLiteNewComment,
  SQLiteNewVideoReport,
  SQLiteNewCommentReport,
  SQLiteNewVideoReportArchive,
  SQLiteNewCommentReportArchive,
  SQLiteNewLiveChatMessage,
  SQLiteNewCryptoWalletAddress,
  SQLiteNewLink,
  PostgresVideo,
  PostgresComment,
  PostgresVideoReport,
  PostgresCommentReport,
  PostgresVideoReportArchive,
  PostgresCommentReportArchive,
  PostgresLiveChatMessage,
  PostgresCryptoWalletAddress,
  PostgresLink,
  PostgresNewVideo,
  PostgresNewComment,
  PostgresNewVideoReport,
  PostgresNewCommentReport,
  PostgresNewVideoReportArchive,
  PostgresNewCommentReportArchive,
  PostgresNewLiveChatMessage,
  PostgresNewCryptoWalletAddress,
  PostgresNewLink,
} from '@database/index.js';
import type { CloudflareService } from '@services/cloudflare.js';
import type { IndexerService } from '@services/indexer.js';

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
export class SettingsService extends BaseService {
  private readonly indexerService: IndexerService;
  private readonly cloudflareService: CloudflareService;
  private readonly videosRepository: IVideosRepository<SQLiteVideo, SQLiteNewVideo> | IVideosRepository<PostgresVideo, PostgresNewVideo>;
  private readonly commentsRepository: ICommentsRepository<SQLiteComment, SQLiteNewComment> | ICommentsRepository<PostgresComment, PostgresNewComment>;
  private readonly reportsVideosRepository: IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport> | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>;
  private readonly reportsCommentsRepository: IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport> | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>;
  private readonly reportsArchiveVideosRepository: IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive> | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>;
  private readonly reportsArchiveCommentsRepository: IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive> | IReportsArchiveCommentsRepository<PostgresCommentReportArchive, PostgresNewCommentReportArchive>;
  private readonly liveChatMessagesRepository: ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage> | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>;
  private readonly monetizationRepository: IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>;
  private readonly linksRepository: ILinksRepository<SQLiteLink, SQLiteNewLink> | ILinksRepository<PostgresLink, PostgresNewLink>;

  constructor(
    logger: Logger,
    videosRepository: IVideosRepository<SQLiteVideo, SQLiteNewVideo> | IVideosRepository<PostgresVideo, PostgresNewVideo>,
    commentsRepository: ICommentsRepository<SQLiteComment, SQLiteNewComment> | ICommentsRepository<PostgresComment, PostgresNewComment>,
    reportsVideosRepository: IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport> | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>,
    reportsCommentsRepository: IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport> | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>,
    reportsArchiveVideosRepository: IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive> | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>,
    reportsArchiveCommentsRepository: IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive> | IReportsArchiveCommentsRepository<PostgresCommentReportArchive, PostgresNewCommentReportArchive>,
    liveChatMessagesRepository: ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage> | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>,
    monetizationRepository: IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>,
    linksRepository: ILinksRepository<SQLiteLink, SQLiteNewLink> | ILinksRepository<PostgresLink, PostgresNewLink>,
    indexerService: IndexerService,
    cloudflareService: CloudflareService
  ) {
    super('SettingsService', logger);
    this.videosRepository = videosRepository;
    this.commentsRepository = commentsRepository;
    this.reportsVideosRepository = reportsVideosRepository;
    this.reportsCommentsRepository = reportsCommentsRepository;
    this.reportsArchiveVideosRepository = reportsArchiveVideosRepository;
    this.reportsArchiveCommentsRepository = reportsArchiveCommentsRepository;
    this.liveChatMessagesRepository = liveChatMessagesRepository;
    this.monetizationRepository = monetizationRepository;
    this.linksRepository = linksRepository;
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
    if (hasIndexedVideos) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeName(name);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService.isEnabled()) {
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
    if (hasIndexedVideos) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeAbout(about);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService.isEnabled()) {
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
    if (hasIndexedVideos) {
      try {
        // Perform node identification before updating indexer
        await this.indexerService.performNodeIdentification();
        await this.indexerService.updateNodeId(nodeId);

        // Purge node page from Cloudflare cache
        if (this.cloudflareService.isEnabled()) {
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
    if (hasIndexedVideos) {
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
  async updateDatabaseConfig(databaseConfig: DatabaseConfig): Promise<void> {
    const databaseDialect = databaseConfig.databaseDialect;

    // Test connection before saving config
    if (databaseDialect === 'sqlite') {
      // Test SQLite connection using better-sqlite3
      const config = getConfig();

      const databaseFilePath = config.paths.databaseFilePath;

      const Database = (await import('better-sqlite3')).default;

      const db = new Database(databaseFilePath, { readonly: true, fileMustExist: false });

      try {
        // Test connection with a simple query
        db.prepare('SELECT 1').get();
      } finally {
        db.close();
      }
    } else {
      // Test PostgreSQL connection using postgres driver
      const postgresConfig = databaseConfig.postgresConfig;

      if (postgresConfig === undefined) {
        throw new Error('postgres configuration is required');
      }

      const postgres = (await import('postgres')).default;

      const sql = postgres({
        database: postgresConfig.databaseName,
        username: postgresConfig.username,
        password: postgresConfig.password,
        host: postgresConfig.host,
        port: postgresConfig.port,
        max: 1,
        connect_timeout: 10,
      });

      try {
        // Test connection with a simple query
        await sql`SELECT 1`;
      } finally {
        await sql.end();
      }
    }

    const config = getConfig();

    config.updateNodeSettings({ databaseConfig });

    this.logger.info('Database configuration updated', { databaseConfig });
  }

  /**
   * Update storage configuration
   */
  updateStorageConfig(storageConfig: StorageConfig): void {
    const config = getConfig();

    config.updateNodeSettings({ storageConfig });

    this.logger.info('Storage configuration updated', { mode: storageConfig.storageMode });
  }

  /**
   * Update Cloudflare configuration
   */
  updateCloudflareConfig(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): void {
    const config = getConfig();

    config.updateNodeSettings({
      isCloudflareCdnEnabled: true,
      cloudflareEmailAddress: cloudflareEmailAddress,
      cloudflareZoneId: cloudflareZoneId,
      cloudflareGlobalApiKey: cloudflareGlobalApiKey,
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
      if (this.cloudflareService.isEnabled()) {
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
      if (this.cloudflareService.isEnabled()) {
        await this.cloudflareService.purgeNodeImages();
      }

      this.logger.info('Banner updated');
    });
  }

  /**
   * Perform node identification
   */
  async performNodeIdentification(): Promise<void> {
    await this.indexerService.performNodeIdentification();
  }

  /**
   * Get node identification
   */
  getNodeIdentification(): Record<string, unknown> {
    const config = getConfig();
    return config.nodeIdentification as Record<string, unknown>;
  }

  /**
   * Check if node is in development mode (NODE_ENV=development)
   */
  isDevelopment(): boolean {
    const config = getConfig();
    return config.isDevelopment;
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

  /**
   * Mark all videos as not indexed
   */
  async markAllVideosAsNotIndexed(): Promise<void> {
    return this.withErrorLogging('markAllVideosAsNotIndexed', async () => {
      await this.videosRepository.markAllIndexedAsOutdated();
    });
  }

  /**
   * Get all indexed videos
   */
  async getIndexedVideos(): Promise<(SQLiteVideo | PostgresVideo)[]> {
    return this.withErrorLogging('getIndexedVideos', async () => {
      return this.videosRepository.findIndexed();
    });
  }

  /**
   * Export all application data
   */
  async exportAllData(): Promise<{
    videos: (SQLiteVideo | PostgresVideo)[];
    comments: (SQLiteComment | PostgresComment)[];
    videoReports: (SQLiteVideoReport | PostgresVideoReport)[];
    commentReports: (SQLiteCommentReport | PostgresCommentReport)[];
    videoReportsArchives: (SQLiteVideoReportArchive | PostgresVideoReportArchive)[];
    commentReportsArchives: (SQLiteCommentReportArchive | PostgresCommentReportArchive)[];
    liveChatMessages: (SQLiteLiveChatMessage | PostgresLiveChatMessage)[];
    cryptoWalletAddresses: (SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress)[];
    links: (SQLiteLink | PostgresLink)[];
  }> {
    return this.withErrorLogging('exportAllData', async () => {
      const [
        videos,
        comments,
        videoReports,
        commentReports,
        videoReportsArchives,
        commentReportsArchives,
        liveChatMessages,
        cryptoWalletAddresses,
        links,
      ] = await Promise.all([
        this.videosRepository.findAll(),
        this.commentsRepository.findAll(),
        this.reportsVideosRepository.findAll(),
        this.reportsCommentsRepository.findAll(),
        this.reportsArchiveVideosRepository.findAll(),
        this.reportsArchiveCommentsRepository.findAll(),
        this.liveChatMessagesRepository.findAll(),
        this.monetizationRepository.findAll(),
        this.linksRepository.findAll(),
      ]);

      return {
        videos,
        comments,
        videoReports,
        commentReports,
        videoReportsArchives,
        commentReportsArchives,
        liveChatMessages,
        cryptoWalletAddresses,
        links,
      };
    });
  }

  /**
   * Delete all application data
   */
  async deleteAllData(): Promise<void> {
    return this.withErrorLogging('deleteAllData', async () => {
      await Promise.all([
        this.commentsRepository.deleteAll(),
        this.liveChatMessagesRepository.deleteAll(),
        this.reportsCommentsRepository.deleteAll(),
        this.reportsVideosRepository.deleteAll(),
        this.reportsArchiveCommentsRepository.deleteAll(),
        this.reportsArchiveVideosRepository.deleteAll(),
      ]);
    });
  }

  /**
   * Import database from JSON file
   */
  async importDatabase(databaseFileContent: string): Promise<void> {
    return this.withErrorLogging('importDatabase', async () => {
      // Parse the JSON database
      interface DatabaseTable {
        rows: Record<string, unknown>[];
        tableName: string;
      }
      const database: DatabaseTable[] = JSON.parse(databaseFileContent) as DatabaseTable[];

      // Clear all tables first (order matters due to potential foreign keys)
      await this.commentsRepository.deleteAll();
      await this.liveChatMessagesRepository.deleteAll();
      await this.reportsCommentsRepository.deleteAll();
      await this.reportsVideosRepository.deleteAll();
      await this.reportsArchiveCommentsRepository.deleteAll();
      await this.reportsArchiveVideosRepository.deleteAll();
      await this.monetizationRepository.deleteAll();
      await this.linksRepository.deleteAll();
      await this.videosRepository.deleteAll();

      // Import each table
      for (const table of database) {
        const { rows, tableName } = table;

        if (rows.length === 0) {
          continue;
        }

        // Map table names to repository createMany calls
        switch (tableName) {
          case 'videos':
            await this.videosRepository.createMany(
              rows as Parameters<typeof this.videosRepository.createMany>[0]
            );
            break;
          case 'comments':
            await this.commentsRepository.createMany(
              rows as Parameters<typeof this.commentsRepository.createMany>[0]
            );
            break;
          case 'videoreports':
            await this.reportsVideosRepository.createMany(
              rows as Parameters<typeof this.reportsVideosRepository.createMany>[0]
            );
            break;
          case 'commentreports':
            await this.reportsCommentsRepository.createMany(
              rows as Parameters<typeof this.reportsCommentsRepository.createMany>[0]
            );
            break;
          case 'videoreportsarchives':
            await this.reportsArchiveVideosRepository.createMany(
              rows as Parameters<typeof this.reportsArchiveVideosRepository.createMany>[0]
            );
            break;
          case 'commentreportsarchives':
            await this.reportsArchiveCommentsRepository.createMany(
              rows as Parameters<typeof this.reportsArchiveCommentsRepository.createMany>[0]
            );
            break;
          case 'livechatmessages':
            await this.liveChatMessagesRepository.createMany(
              rows as Parameters<typeof this.liveChatMessagesRepository.createMany>[0]
            );
            break;
          case 'cryptowalletaddresses':
            await this.monetizationRepository.createMany(
              rows as Parameters<typeof this.monetizationRepository.createMany>[0]
            );
            break;
          case 'links':
            await this.linksRepository.createMany(
              rows as Parameters<typeof this.linksRepository.createMany>[0]
            );
            break;
          default:
            this.logger.warn(`Unknown table name during import: ${tableName}`);
        }
      }
    });
  }
}
