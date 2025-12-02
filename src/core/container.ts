/**
 * Dependency Injection Container
 *
 * Configures and provides the Awilix DI container for service resolution.
 * All services and repositories are registered here for dependency injection.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';

// Database layer
import type { DatabaseClient } from '../database/connection';
import { VideosRepository } from '../database/repositories/videos';
import { CommentsRepository } from '../database/repositories/comments';
import { ReportsVideosRepository } from '../database/repositories/reports-videos';
import { ReportsCommentsRepository } from '../database/repositories/reports-comments';
import { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos';
import { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments';
import { LiveChatMessageRepository } from '../database/repositories/live-chat-messages';
import { MonetizationRepository } from '../database/repositories/monetization';
import { LinksRepository } from '../database/repositories/links';

// Services
import { VideosService } from '../services/videos';
import { CommentService } from '../services/comment';
import { StreamService } from '../services/stream';
import { AuthService } from '../services/auth';
import { StorageService } from '../services/storage';
import { IndexerService } from '../services/indexer';
import { CloudflareService } from '../services/cloudflare';
import { WebSocketService } from '../services/websocket';
import { ReportService } from '../services/report';
import { SettingsService } from '../services/settings';
import { UploadTrackerService } from '../services/upload-tracker';
import { VideoUploadService } from '../services/video-upload';

/**
 * Container cradle type - defines all registered dependencies
 */
export interface ContainerCradle {
  // Database
  db: DatabaseClient;

  // Repositories
  videoRepository: VideosRepository;
  commentRepository: CommentsRepository;
  videoReportRepository: ReportsVideosRepository;
  commentReportRepository: ReportsCommentsRepository;
  videoReportsArchiveRepository: ReportsArchiveVideosRepository;
  commentReportsArchiveRepository: ReportsArchiveCommentsRepository;
  liveChatMessageRepository: LiveChatMessageRepository;
  monetizationRepository: MonetizationRepository;
  linkRepository: LinksRepository;

  // Services
  videoService: VideosService;
  commentService: CommentService;
  streamService: StreamService;
  authService: AuthService;
  storageService: StorageService;
  indexerService: IndexerService;
  cloudflareService: CloudflareService;
  websocketService: WebSocketService;
  reportService: ReportService;
  settingsService: SettingsService;
  uploadTrackerService: UploadTrackerService;
  videoUploadService: VideoUploadService;
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
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  // Register database client
  appContainer.register({
    db: asValue(db),
  });

  // Register repositories (they need db in constructor)
  appContainer.register({
    videoRepository: asClass(VideosRepository).singleton(),
    commentRepository: asClass(CommentsRepository).singleton(),
    videoReportRepository: asClass(ReportsVideosRepository).singleton(),
    commentReportRepository: asClass(ReportsCommentsRepository).singleton(),
    videoReportsArchiveRepository: asClass(ReportsArchiveVideosRepository).singleton(),
    commentReportsArchiveRepository: asClass(ReportsArchiveCommentsRepository).singleton(),
    liveChatMessageRepository: asClass(LiveChatMessageRepository).singleton(),
    monetizationRepository: asClass(MonetizationRepository).singleton(),
    linkRepository: asClass(LinksRepository).singleton(),
  });

  // Register services (singletons for shared state)
  appContainer.register({
    authService: asClass(AuthService).singleton(),
    storageService: asClass(StorageService).singleton(),
    indexerService: asClass(IndexerService).singleton(),
    websocketService: asClass(WebSocketService).singleton(),
    cloudflareService: asClass(CloudflareService).singleton(),
    videoService: asClass(VideosService).singleton(),
    commentService: asClass(CommentService).singleton(),
    streamService: asClass(StreamService).singleton(),
    reportService: asClass(ReportService).singleton(),
    settingsService: asClass(SettingsService).singleton(),
    uploadTrackerService: asClass(UploadTrackerService).singleton(),
    videoUploadService: asClass(VideoUploadService).singleton(),
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
