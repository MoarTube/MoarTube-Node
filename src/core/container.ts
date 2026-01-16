/**
 * Dependency Injection Container
 *
 * Configures and provides the Awilix DI container for service resolution.
 * All services and repositories are registered here for dependency injection.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';
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
  SQLiteNewVideo,
  PostgresVideo,
  PostgresNewVideo,
  SQLiteComment,
  SQLiteNewComment,
  PostgresComment,
  PostgresNewComment,
  SQLiteVideoReport,
  SQLiteNewVideoReport,
  PostgresVideoReport,
  PostgresNewVideoReport,
  SQLiteCommentReport,
  SQLiteNewCommentReport,
  PostgresCommentReport,
  PostgresNewCommentReport,
  SQLiteVideoReportArchive,
  SQLiteNewVideoReportArchive,
  PostgresVideoReportArchive,
  PostgresNewVideoReportArchive,
  SQLiteCommentReportArchive,
  SQLiteNewCommentReportArchive,
  PostgresCommentReportArchive,
  PostgresNewCommentReportArchive,
  SQLiteLiveChatMessage,
  SQLiteNewLiveChatMessage,
  PostgresLiveChatMessage,
  PostgresNewLiveChatMessage,
  SQLiteCryptoWalletAddress,
  SQLiteNewCryptoWalletAddress,
  PostgresCryptoWalletAddress,
  PostgresNewCryptoWalletAddress,
  SQLiteLink,
  SQLiteNewLink,
  PostgresLink,
  PostgresNewLink
} from '@database/repositories/index.js';

// Logger
import { Logger } from '@utils/index.js';

// Database layer
import type { DatabaseClient } from '@database/index.js';
import type { DatabaseClient as SQLiteClient } from '@database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@database/postgres-connection.js';
import { getConfig } from '@config/index.js';

// Services
import {
  VideosService,
  CommentsService,
  StreamsService,
  AccountService,
  StorageService,
  IndexerService,
  CloudflareService,
  WebSocketService,
  ReportsService,
  SettingsService,
  UploadTrackerService,
  VideoUploadService,
  LiveChatService,
  LinksService,
  MonetizationService,
} from '@services/index.js';

/**
 * Container cradle type - defines all registered dependencies
 */
export interface ContainerCradle {
  // Core utilities
  logger: Logger;

  // Database
  db: DatabaseClient;

  // Repositories
  videosRepository: IVideosRepository<SQLiteVideo, SQLiteNewVideo> | IVideosRepository<PostgresVideo, PostgresNewVideo>;
  commentsRepository: ICommentsRepository<SQLiteComment, SQLiteNewComment> | ICommentsRepository<PostgresComment, PostgresNewComment>;
  reportsVideosRepository: IReportsVideosRepository<SQLiteVideoReport, SQLiteNewVideoReport> | IReportsVideosRepository<PostgresVideoReport, PostgresNewVideoReport>;
  reportsCommentsRepository: IReportsCommentsRepository<SQLiteCommentReport, SQLiteNewCommentReport> | IReportsCommentsRepository<PostgresCommentReport, PostgresNewCommentReport>;
  reportsArchiveVideosRepository: IReportsArchiveVideosRepository<SQLiteVideoReportArchive, SQLiteNewVideoReportArchive> | IReportsArchiveVideosRepository<PostgresVideoReportArchive, PostgresNewVideoReportArchive>;
  reportsArchiveCommentsRepository: IReportsArchiveCommentsRepository<SQLiteCommentReportArchive, SQLiteNewCommentReportArchive> | IReportsArchiveCommentsRepository<PostgresCommentReportArchive, PostgresNewCommentReportArchive>;
  liveChatMessagesRepository: ILiveChatMessagesRepository<SQLiteLiveChatMessage, SQLiteNewLiveChatMessage> | ILiveChatMessagesRepository<PostgresLiveChatMessage, PostgresNewLiveChatMessage>;
  monetizationRepository: IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>;
  linksRepository: ILinksRepository<SQLiteLink, SQLiteNewLink> | ILinksRepository<PostgresLink, PostgresNewLink>;

  // Services
  videosService: VideosService;
  commentsService: CommentsService;
  streamsService: StreamsService;
  accountService: AccountService;
  storageService: StorageService;
  indexerService: IndexerService;
  cloudflareService: CloudflareService;
  websocketService: WebSocketService;
  reportsService: ReportsService;
  settingsService: SettingsService;
  uploadTrackerService: UploadTrackerService;
  videoUploadService: VideoUploadService;
  liveChatService: LiveChatService;
  linksService: LinksService;
  monetizationService: MonetizationService;
}

/**
 * Typed container type
 */
export type Container = AwilixContainer<ContainerCradle>;

/**
 * Global container instance
 */
let container: Container | null = null;

/**
 * Create and configure the DI container
 *
 * @param db - Database client instance
 * @returns Configured Awilix container
 */
export async function createAppContainer(db: DatabaseClient): Promise<Container> {
  const appContainer = createContainer<ContainerCradle>({
    injectionMode: InjectionMode.CLASSIC,
    strict: true,
  });

  // Get database dialect to determine which schemas to use
  const config = getConfig();
  const dbDialect = config.nodeSettings.databaseConfig.databaseDialect;

  const {
    createVideosRepository,
    createCommentsRepository,
    createReportsVideosRepository,
    createReportsCommentsRepository,
    createReportsArchiveVideosRepository,
    createReportsArchiveCommentsRepository,
    createLiveChatMessagesRepository,
    createMonetizationRepository,
    createLinksRepository,
  } = await import('@database/repositories/index.js');

  // Register database client
  appContainer.register({
    db: asValue(db),
  });

  // Register logger
  appContainer.register({
    logger: asValue(Logger.getInstance()),
  });

  // Helper function to create typed repositories
  const createTypedRepository = <T>(
    dialect: 'sqlite' | 'postgres',
    sqliteFactory: (dialect: 'sqlite', db: SQLiteClient) => T,
    postgresFactory: (dialect: 'postgres', db: PostgresClient) => T
  ): T => {
    return dialect === 'sqlite'
      ? sqliteFactory('sqlite', db as SQLiteClient)
      : postgresFactory('postgres', db as PostgresClient);
  };

  // Register repositories (they need db and table in constructor)
  appContainer.register({
    videosRepository: asValue(createTypedRepository(
      dbDialect,
      createVideosRepository,
      createVideosRepository
    )),
    commentsRepository: asValue(createTypedRepository(
      dbDialect,
      createCommentsRepository,
      createCommentsRepository
    )),
    reportsVideosRepository: asValue(createTypedRepository(
      dbDialect,
      createReportsVideosRepository,
      createReportsVideosRepository
    )),
    reportsCommentsRepository: asValue(createTypedRepository(
      dbDialect,
      createReportsCommentsRepository,
      createReportsCommentsRepository
    )),
    reportsArchiveVideosRepository: asValue(createTypedRepository(
      dbDialect,
      createReportsArchiveVideosRepository,
      createReportsArchiveVideosRepository
    )),
    reportsArchiveCommentsRepository: asValue(createTypedRepository(
      dbDialect,
      createReportsArchiveCommentsRepository,
      createReportsArchiveCommentsRepository
    )),
    liveChatMessagesRepository: asValue(createTypedRepository(
      dbDialect,
      createLiveChatMessagesRepository,
      createLiveChatMessagesRepository
    )),
    monetizationRepository: asValue(createTypedRepository(
      dbDialect,
      createMonetizationRepository,
      createMonetizationRepository
    )),
    linksRepository: asValue(createTypedRepository(
      dbDialect,
      createLinksRepository,
      createLinksRepository
    )),
  });

  // Register services (singletons for shared state)
  appContainer.register({
    accountService: asClass(AccountService).singleton(),
    storageService: asClass(StorageService).singleton(),
    indexerService: asClass(IndexerService).singleton(),
    websocketService: asClass(WebSocketService).singleton(),
    cloudflareService: asClass(CloudflareService).singleton(),
    videosService: asClass(VideosService).singleton(),
    commentsService: asClass(CommentsService).singleton(),
    streamsService: asClass(StreamsService).singleton(),
    reportsService: asClass(ReportsService).singleton(),
    settingsService: asClass(SettingsService).singleton(),
    videoUploadService: asClass(VideoUploadService).singleton(),
    uploadTrackerService: asClass(UploadTrackerService).singleton(),
    liveChatService: asClass(LiveChatService).singleton(),
    linksService: asClass(LinksService).singleton(),
    monetizationService: asClass(MonetizationService).singleton(),
  });

  // Store globally
  container = appContainer;

  return appContainer;
}

/**
 * Get the global container instance
 *
 * @throws Error if container not initialized
 * @returns The container instance
 */
export function getContainer(): Container {
  if (!container) {
    throw new Error('Container not initialized. Call createAppContainer(db) first.');
  }
  return container;
}
