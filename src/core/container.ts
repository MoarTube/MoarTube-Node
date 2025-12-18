/**
 * Dependency Injection Container
 *
 * Configures and provides the Awilix DI container for service resolution.
 * All services and repositories are registered here for dependency injection.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';

// Logger
import { Logger } from '../utils/logger.js';

// Database layer
import type { DatabaseClient } from '../database/connection.js';
import { getConfig } from '../config/index.js';

// Services
import { VideosService } from '../services/videos.js';
import { CommentsService } from '../services/comments.js';
import { StreamsService } from '../services/streams.js';
import { AccountService } from '../services/account.js';
import { StorageService } from '../services/storage.js';
import { IndexerService } from '../services/indexer.js';
import { CloudflareService } from '../services/cloudflare.js';
import { WebSocketService } from '../services/websocket.js';
import { ReportsService } from '../services/reports.js';
import { SettingsService } from '../services/settings.js';
import { UploadTrackerService } from '../services/upload-tracker.js';
import { VideoUploadService } from '../services/video-upload.js';
import { LiveChatService } from '../services/live-chat.js';
import { LinksService } from '../services/links.js';
import { MonetizationService } from '../services/monetization.js';

/**
 * Container cradle type - defines all registered dependencies
 */
export interface ContainerCradle {
  // Core utilities
  logger: Logger;

  // Database
  db: DatabaseClient;

  // Repositories
  videosRepository: any;
  commentsRepository: any;
  reportsVideosRepository: any;
  reportsCommentsRepository: any;
  reportsArchiveVideosRepository: any;
  reportsArchiveCommentsRepository: any;
  liveChatMessagesRepository: any;
  monetizationRepository: any;
  linksRepository: any;

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

  // Get database dialect to determine which repositories to use
  const config = getConfig();
  const dbDialect = config.nodeSettings.databaseConfig.databaseDialect;

  // Dynamically import repositories based on dialect
  const {
    VideosRepository,
    CommentsRepository,
    ReportsVideosRepository,
    ReportsCommentsRepository,
    ReportsArchiveVideosRepository,
    ReportsArchiveCommentsRepository,
    LiveChatMessagesRepository,
    MonetizationRepository,
    LinksRepository,
  } = await (dbDialect === 'postgres'
    ? import('../database/repositories/postgres/index.js')
    : import('../database/repositories/sqlite/index.js'));

  // Register database client
  appContainer.register({
    db: asValue(db),
  });

  // Register logger
  appContainer.register({
    logger: asValue(Logger.getInstance()),
  });

  // Register repositories (they need db in constructor)
  appContainer.register({
    videosRepository: asClass(VideosRepository as any).singleton(),
    commentsRepository: asClass(CommentsRepository as any).singleton(),
    reportsVideosRepository: asClass(ReportsVideosRepository as any).singleton(),
    reportsCommentsRepository: asClass(ReportsCommentsRepository as any).singleton(),
    reportsArchiveVideosRepository: asClass(ReportsArchiveVideosRepository as any).singleton(),
    reportsArchiveCommentsRepository: asClass(ReportsArchiveCommentsRepository as any).singleton(),
    liveChatMessagesRepository: asClass(LiveChatMessagesRepository as any).singleton(),
    monetizationRepository: asClass(MonetizationRepository as any).singleton(),
    linksRepository: asClass(LinksRepository as any).singleton(),
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

/**
 * Check if container has been initialized
 */
export function isContainerInitialized(): boolean {
  return container !== null;
}

/**
 * Resolve a service or repository from the container
 *
 * @param name - Name of the dependency to resolve
 * @returns The resolved dependency
 */
export function resolve<K extends keyof ContainerCradle>(name: K): ContainerCradle[K] {
  return getContainer().resolve(name);
}

/**
 * Dispose of the container and all singletons
 */
export async function disposeContainer(): Promise<void> {
  if (container) {
    await container.dispose();
    container = null;
  }
}
