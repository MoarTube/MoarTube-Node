/**
 * Dependency Injection Container
 *
 * Configures and provides the Awilix DI container for service resolution.
 * All services and repositories are registered here for dependency injection.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';

// Logger
import { Logger, type ILogger } from '../utils/logger.js';

// Database layer
import type { DatabaseClient } from '../database/connection.js';
import { VideosRepository } from '../database/repositories/videos.js';
import { CommentsRepository } from '../database/repositories/comments.js';
import { ReportsVideosRepository } from '../database/repositories/reports-videos.js';
import { ReportsCommentsRepository } from '../database/repositories/reports-comments.js';
import { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos.js';
import { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments.js';
import { LiveChatMessagesRepository } from '../database/repositories/live-chat-messages.js';
import { MonetizationRepository } from '../database/repositories/monetization.js';
import { LinksRepository } from '../database/repositories/links.js';

// Services
import { VideosService } from '../services/videos.js';
import { CommentsService } from '../services/comments.js';
import { StreamsService } from '../services/streams.js';
import { AuthService } from '../services/auth.js';
import { StorageService } from '../services/storage.js';
import { IndexerService } from '../services/indexer.js';
import { CloudflareService } from '../services/cloudflare.js';
import { WebSocketService } from '../services/websocket.js';
import { ReportsService } from '../services/reports.js';
import { SettingsService } from '../services/settings.js';
import { UploadTrackerService } from '../services/upload-tracker.js';
import { VideoUploadService } from '../services/video-upload.js';
import { LiveChatService } from '../services/chat.js';
import { LinksService } from '../services/links.js';
import { MonetizationService } from '../services/monetization.js';

/**
 * Container cradle type - defines all registered dependencies
 */
export interface ContainerCradle {
  // Core utilities
  logger: ILogger;

  // Database
  db: DatabaseClient;

  // Repositories
  videosRepository: VideosRepository;
  commentsRepository: CommentsRepository;
  reportsVideosRepository: ReportsVideosRepository;
  reportsCommentsRepository: ReportsCommentsRepository;
  reportsArchiveVideosRepository: ReportsArchiveVideosRepository;
  reportsArchiveCommentsRepository: ReportsArchiveCommentsRepository;
  liveChatMessagesRepository: LiveChatMessagesRepository;
  monetizationRepository: MonetizationRepository;
  linksRepository: LinksRepository;

  // Services
  videosService: VideosService;
  commentsService: CommentsService;
  streamsService: StreamsService;
  authService: AuthService;
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
export function createAppContainer(db: DatabaseClient): Container {
  const appContainer = createContainer<ContainerCradle>({
    injectionMode: InjectionMode.CLASSIC,
    strict: true,
  });

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
    videosRepository: asClass(VideosRepository).singleton(),
    commentsRepository: asClass(CommentsRepository).singleton(),
    reportsVideosRepository: asClass(ReportsVideosRepository).singleton(),
    reportsCommentsRepository: asClass(ReportsCommentsRepository).singleton(),
    reportsArchiveVideosRepository: asClass(ReportsArchiveVideosRepository).singleton(),
    reportsArchiveCommentsRepository: asClass(ReportsArchiveCommentsRepository).singleton(),
    liveChatMessagesRepository: asClass(LiveChatMessagesRepository).singleton(),
    monetizationRepository: asClass(MonetizationRepository).singleton(),
    linksRepository: asClass(LinksRepository).singleton(),
  });

  // Register services (singletons for shared state)
  appContainer.register({
    authService: asClass(AuthService).singleton(),
    storageService: asClass(StorageService).singleton(),
    indexerService: asClass(IndexerService).singleton(),
    websocketService: asClass(WebSocketService).singleton(),
    cloudflareService: asClass(CloudflareService).singleton(),
    videosService: asClass(VideosService).singleton(),
    commentsService: asClass(CommentsService).singleton(),
    streamsService: asClass(StreamsService).singleton(),
    reportsService: asClass(ReportsService).singleton(),
    settingsService: asClass(SettingsService)
      .singleton()
      .inject(() => [
        'logger',
        'videosRepository',
        'commentsRepository',
        'reportsVideosRepository',
        'reportsCommentsRepository',
        'reportsArchiveVideosRepository',
        'reportsArchiveCommentsRepository',
        'liveChatMessagesRepository',
        'monetizationRepository',
        'linksRepository',
        'indexerService',
        'cloudflareService',
      ]),
    uploadTrackerService: asClass(UploadTrackerService).singleton(),
    videoUploadService: asClass(VideoUploadService)
      .singleton()
      .inject(() => ['videosService']),
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

/**
 * Create a scoped container for request handling
 *
 * Scoped containers share singletons with the parent but can have
 * request-scoped dependencies.
 */
export function createScope(): AwilixContainer<ContainerCradle> {
  return getContainer().createScope();
}
