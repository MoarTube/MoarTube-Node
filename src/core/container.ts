/**
 * Dependency Injection Container
 *
 * Configures and provides the Awilix DI container for service resolution.
 * All services and repositories are registered here for dependency injection.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';

// Database layer
import type { DatabaseClient } from '../database/connection';
import { VideoRepository } from '../database/repositories/video.repository';
import { CommentRepository } from '../database/repositories/comment.repository';
import { VideoReportRepository } from '../database/repositories/video-report.repository';
import { CommentReportRepository } from '../database/repositories/comment-report.repository';
import { VideoReportsArchiveRepository } from '../database/repositories/video-reports-archive.repository';
import { CommentReportsArchiveRepository } from '../database/repositories/comment-reports-archive.repository';
import { LiveChatMessageRepository } from '../database/repositories/live-chat-message.repository';
import { CryptoWalletAddressRepository } from '../database/repositories/crypto-wallet-address.repository';
import { LinkRepository } from '../database/repositories/link.repository';

// Services
import { VideoService } from '../services/video.service';
import { CommentService } from '../services/comment.service';
import { StreamService } from '../services/stream.service';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { IndexerService } from '../services/indexer.service';
import { CloudflareService } from '../services/cloudflare.service';
import { WebSocketService } from '../services/websocket.service';
import { ReportService } from '../services/report.service';
import { SettingsService } from '../services/settings.service';

/**
 * Container cradle type - defines all registered dependencies
 */
export interface ContainerCradle {
  // Database
  db: DatabaseClient;

  // Repositories
  videoRepository: VideoRepository;
  commentRepository: CommentRepository;
  videoReportRepository: VideoReportRepository;
  commentReportRepository: CommentReportRepository;
  videoReportArchiveRepository: VideoReportsArchiveRepository;
  commentReportArchiveRepository: CommentReportsArchiveRepository;
  liveChatMessageRepository: LiveChatMessageRepository;
  cryptoWalletAddressRepository: CryptoWalletAddressRepository;
  linkRepository: LinkRepository;

  // Services
  videoService: VideoService;
  commentService: CommentService;
  streamService: StreamService;
  authService: AuthService;
  storageService: StorageService;
  indexerService: IndexerService;
  cloudflareService: CloudflareService;
  websocketService: WebSocketService;
  reportService: ReportService;
  settingsService: SettingsService;
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
    videoRepository: asClass(VideoRepository).singleton(),
    commentRepository: asClass(CommentRepository).singleton(),
    videoReportRepository: asClass(VideoReportRepository).singleton(),
    commentReportRepository: asClass(CommentReportRepository).singleton(),
    videoReportArchiveRepository: asClass(VideoReportsArchiveRepository).singleton(),
    commentReportArchiveRepository: asClass(CommentReportsArchiveRepository).singleton(),
    liveChatMessageRepository: asClass(LiveChatMessageRepository).singleton(),
    cryptoWalletAddressRepository: asClass(CryptoWalletAddressRepository).singleton(),
    linkRepository: asClass(LinkRepository).singleton(),
  });

  // Register services (singletons for shared state)
  appContainer.register({
    authService: asClass(AuthService).singleton(),
    storageService: asClass(StorageService).singleton(),
    indexerService: asClass(IndexerService).singleton(),
    websocketService: asClass(WebSocketService).singleton(),
    cloudflareService: asClass(CloudflareService).singleton(),
    videoService: asClass(VideoService).singleton(),
    commentService: asClass(CommentService).singleton(),
    streamService: asClass(StreamService).singleton(),
    reportService: asClass(ReportService).singleton(),
    settingsService: asClass(SettingsService).singleton(),
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
