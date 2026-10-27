/**
 * Settings Service
 *
 * Service layer for node settings management including configuration,
 * personalization, and system settings.
 */
import fs from 'node:fs';
import { createBackup, restoreBackup, type BackupConfig } from '@/database/backup.js';
import path from 'node:path';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { UpdateNodeSettingsInput } from '@services/interfaces.js';
import { getConfig } from '@config/index.js';
import type { DatabaseConfig, StorageConfig } from '@/types/index.js';
import type {
  ICommentsRepository,
  IReportsVideosRepository,
  IReportsCommentsRepository,
  IReportsArchiveVideosRepository,
  IReportsArchiveCommentsRepository,
  ILiveChatMessagesRepository,
  SQLiteComment,
  SQLiteVideoReport,
  SQLiteCommentReport,
  SQLiteVideoReportArchive,
  SQLiteCommentReportArchive,
  SQLiteLiveChatMessage,
  SQLiteNewComment,
  SQLiteNewVideoReport,
  SQLiteNewCommentReport,
  SQLiteNewVideoReportArchive,
  SQLiteNewCommentReportArchive,
  SQLiteNewLiveChatMessage,
  PostgresComment,
  PostgresVideoReport,
  PostgresCommentReport,
  PostgresVideoReportArchive,
  PostgresCommentReportArchive,
  PostgresLiveChatMessage,
  PostgresNewComment,
  PostgresNewVideoReport,
  PostgresNewCommentReport,
  PostgresNewVideoReportArchive,
  PostgresNewCommentReportArchive,
  PostgresNewLiveChatMessage,
} from '@database/index.js';
import type { CloudflareService } from '@services/cloudflare.js';

/**
 * SettingsService class
 *
 * Handles all node settings and configuration management:
 * - Reading and updating node settings
 * - Managing node identity (name, about, avatar, banner)
 * - Database and storage configuration
 * - Cloudflare integration settings
 */
export class SettingsService extends BaseService {
  private backupConfig(): BackupConfig {
    const config = getConfig();
    const database = config.nodeSettings.databaseConfig;
    if (database.databaseDialect === 'sqlite') {
      return { dialect: 'sqlite', sqlitePath: config.paths.databaseFilePath };
    }
    const pg = database.postgresConfig;
    if (!pg) {
      throw new Error('Missing PostgreSQL configuration');
    }
    return {
      dialect: 'postgres',
      postgresUrl:
        'postgres://' +
        encodeURIComponent(pg.username) +
        ':' +
        encodeURIComponent(pg.password) +
        '@' +
        pg.host +
        ':' +
        String(pg.port) +
        '/' +
        encodeURIComponent(pg.databaseName),
    };
  }
  async createDatabaseBackup() {
    return createBackup(this.backupConfig());
  }
  async restoreDatabaseBackup(file: string): Promise<void> {
    await restoreBackup(file, this.backupConfig());
  }

  private readonly cloudflareService: CloudflareService;
  private readonly commentsRepository:
    | ICommentsRepository<SQLiteComment, SQLiteNewComment>
    | ICommentsRepository<PostgresComment, PostgresNewComment>;
  private readonly reportsVideosRepository:
    | IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport>
    | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>;
  private readonly reportsCommentsRepository:
    | IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport>
    | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>;
  private readonly reportsArchiveVideosRepository:
    | IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive>
    | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>;
  private readonly reportsArchiveCommentsRepository:
    | IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive>
    | IReportsArchiveCommentsRepository<
        PostgresCommentReportArchive,
        PostgresNewCommentReportArchive
      >;
  private readonly liveChatMessagesRepository:
    | ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage>
    | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>;

  constructor(
    logger: Logger,
    commentsRepository:
      | ICommentsRepository<SQLiteComment, SQLiteNewComment>
      | ICommentsRepository<PostgresComment, PostgresNewComment>,
    reportsVideosRepository:
      | IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport>
      | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>,
    reportsCommentsRepository:
      | IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport>
      | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>,
    reportsArchiveVideosRepository:
      | IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive>
      | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>,
    reportsArchiveCommentsRepository:
      | IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive>
      | IReportsArchiveCommentsRepository<
          PostgresCommentReportArchive,
          PostgresNewCommentReportArchive
        >,
    liveChatMessagesRepository:
      | ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage>
      | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>,
    cloudflareService: CloudflareService
  ) {
    super('SettingsService', logger);
    this.commentsRepository = commentsRepository;
    this.reportsVideosRepository = reportsVideosRepository;
    this.reportsCommentsRepository = reportsCommentsRepository;
    this.reportsArchiveVideosRepository = reportsArchiveVideosRepository;
    this.reportsArchiveCommentsRepository = reportsArchiveCommentsRepository;
    this.liveChatMessagesRepository = liveChatMessagesRepository;
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
   */
  async updateNodeName(name: string): Promise<void> {
    const config = getConfig();

    config.updateNodeSettings({ nodeName: name });
    if (this.cloudflareService.isEnabled()) {
      await this.cloudflareService.purgeNodePage();
    }

    this.logger.info('Node name updated', { name });
  }

  /**
   * Update node about
   */
  async updateNodeAbout(about: string): Promise<void> {
    const config = getConfig();
    config.updateNodeSettings({ nodeAbout: about });
    if (this.cloudflareService.isEnabled()) {
      await this.cloudflareService.purgeNodePage();
    }

    this.logger.info('Node about updated');
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
   */
  updateNetworkSettings(protocol: string, address: string, port: string): Promise<void> {
    const config = getConfig();
    config.updateNodeSettings({
      publicNodeProtocol: protocol as '' | 'http' | 'https',
      publicNodeAddress: address,
      publicNodePort: port,
    });

    this.logger.info('Network settings updated', { protocol, address, port });
    return Promise.resolve();
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
}
