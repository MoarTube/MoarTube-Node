/**
 * Container Tests
 *
 * Tests for the dependency injection container.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('@/utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: {
      databaseConfig: {
        databaseDialect: 'sqlite',
      },
    },
  })),
}));

vi.mock('@database/schemas/sqlite/index.js', () => ({
  videos: { name: 'videos' },
  comments: { name: 'comments' },
  videoReports: { name: 'videoReports' },
  commentReports: { name: 'commentReports' },
  videoReportsArchive: { name: 'videoReportsArchive' },
  commentReportsArchive: { name: 'commentReportsArchive' },
  liveChatMessages: { name: 'liveChatMessages' },
  cryptoWalletAddresses: { name: 'cryptoWalletAddresses' },
  links: { name: 'links' },
}));

vi.mock('@database/schemas/postgres/index.js', () => ({
  videos: { name: 'videos_pg' },
  comments: { name: 'comments_pg' },
  videoReports: { name: 'videoReports_pg' },
  commentReports: { name: 'commentReports_pg' },
  videoReportsArchive: { name: 'videoReportsArchive_pg' },
  commentReportsArchive: { name: 'commentReportsArchive_pg' },
  liveChatMessages: { name: 'liveChatMessages_pg' },
  cryptoWalletAddresses: { name: 'cryptoWalletAddresses_pg' },
  links: { name: 'links_pg' },
}));

vi.mock('@database/repositories/index.js', () => ({
  VideosRepository: class VideosRepository {
    constructor(public db: unknown, public videosTable: unknown) {}
  },
  CommentsRepository: class CommentsRepository {
    constructor(public db: unknown, public commentsTable: unknown) {}
  },
  ReportsVideosRepository: class ReportsVideosRepository {
    constructor(public db: unknown, public videoReportsTable: unknown) {}
  },
  ReportsCommentsRepository: class ReportsCommentsRepository {
    constructor(public db: unknown, public commentReportsTable: unknown) {}
  },
  ReportsArchiveVideosRepository: class ReportsArchiveVideosRepository {
    constructor(public db: unknown, public videoReportsArchiveTable: unknown) {}
  },
  ReportsArchiveCommentsRepository: class ReportsArchiveCommentsRepository {
    constructor(public db: unknown, public commentReportsArchiveTable: unknown) {}
  },
  LiveChatMessagesRepository: class LiveChatMessagesRepository {
    constructor(public db: unknown, public liveChatMessagesTable: unknown) {}
  },
  MonetizationRepository: class MonetizationRepository {
    constructor(public db: unknown, public cryptoWalletAddressesTable: unknown) {}
  },
  LinksRepository: class LinksRepository {
    constructor(public db: unknown, public linksTable: unknown) {}
  },
}));

// Mock all service classes
vi.mock('@services/videos.js', () => ({
  VideosService: class VideosService {
    constructor() {}
  },
}));

vi.mock('@services/comments.js', () => ({
  CommentsService: class CommentsService {
    constructor() {}
  },
}));

vi.mock('@services/streams.js', () => ({
  StreamsService: class StreamsService {
    constructor() {}
  },
}));

vi.mock('@services/account.js', () => ({
  AccountService: class AccountService {
    constructor() {}
  },
}));

vi.mock('@services/storage.js', () => ({
  StorageService: class StorageService {
    constructor() {}
  },
}));

vi.mock('@services/indexer.js', () => ({
  IndexerService: class IndexerService {
    constructor() {}
  },
}));

vi.mock('@services/cloudflare.js', () => ({
  CloudflareService: class CloudflareService {
    constructor() {}
  },
}));

vi.mock('@services/websocket.js', () => ({
  WebSocketService: class WebSocketService {
    constructor() {}
  },
}));

vi.mock('@services/reports.js', () => ({
  ReportsService: class ReportsService {
    constructor() {}
  },
}));

vi.mock('@services/settings.js', () => ({
  SettingsService: class SettingsService {
    constructor() {}
  },
}));

vi.mock('@services/upload-tracker.js', () => ({
  UploadTrackerService: class UploadTrackerService {
    constructor() {}
  },
}));

vi.mock('@services/video-upload.js', () => ({
  VideoUploadService: class VideoUploadService {
    constructor() {}
  },
}));

vi.mock('@services/live-chat.js', () => ({
  LiveChatService: class LiveChatService {
    constructor() {}
  },
}));

vi.mock('@services/links.js', () => ({
  LinksService: class LinksService {
    constructor() {}
  },
}));

vi.mock('@services/monetization.js', () => ({
  MonetizationService: class MonetizationService {
    constructor() {}
  },
}));

describe('Container', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module to clear container state
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAppContainer', () => {
    it('should create a container with all registered services for SQLite', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      expect(container).toBeDefined();
      expect(container.cradle).toBeDefined();
      expect(container.cradle.db).toBe(mockDb);
    });

    it('should create a container with all registered services for PostgreSQL', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'postgres',
          },
        },
      });

      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      expect(container).toBeDefined();
      expect(container.cradle).toBeDefined();
      expect(container.cradle.db).toBe(mockDb);
    });

    it('should register logger as a value', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      expect(container.cradle.logger).toBeDefined();
    });

    it('should register all repositories as singletons', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      // All repositories should be defined
      expect(container.cradle.videosRepository).toBeDefined();
      expect(container.cradle.commentsRepository).toBeDefined();
      expect(container.cradle.reportsVideosRepository).toBeDefined();
      expect(container.cradle.reportsCommentsRepository).toBeDefined();
      expect(container.cradle.reportsArchiveVideosRepository).toBeDefined();
      expect(container.cradle.reportsArchiveCommentsRepository).toBeDefined();
      expect(container.cradle.liveChatMessagesRepository).toBeDefined();
      expect(container.cradle.monetizationRepository).toBeDefined();
      expect(container.cradle.linksRepository).toBeDefined();
    });

    it('should register all services as singletons', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      // All services should be defined
      expect(container.cradle.videosService).toBeDefined();
      expect(container.cradle.commentsService).toBeDefined();
      expect(container.cradle.streamsService).toBeDefined();
      expect(container.cradle.accountService).toBeDefined();
      expect(container.cradle.storageService).toBeDefined();
      expect(container.cradle.indexerService).toBeDefined();
      expect(container.cradle.cloudflareService).toBeDefined();
      expect(container.cradle.websocketService).toBeDefined();
      expect(container.cradle.reportsService).toBeDefined();
      expect(container.cradle.settingsService).toBeDefined();
      expect(container.cradle.uploadTrackerService).toBeDefined();
      expect(container.cradle.videoUploadService).toBeDefined();
      expect(container.cradle.liveChatService).toBeDefined();
      expect(container.cradle.linksService).toBeDefined();
      expect(container.cradle.monetizationService).toBeDefined();
    });

    it('should return the same singleton instance for services on multiple accesses', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      const service1 = container.cradle.videosService;
      const service2 = container.cradle.videosService;

      expect(service1).toBe(service2);
    });
  });

  describe('getContainer', () => {
    it('should throw error if container not initialized', async () => {
      // Reset modules to ensure fresh state
      vi.resetModules();
      
      const { getContainer } = await import('@core/container.js');

      expect(() => getContainer()).toThrow('Container not initialized. Call createAppContainer(db) first.');
    });

    it('should return container after initialization', async () => {
      const { createAppContainer, getContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      await createAppContainer(mockDb as any);

      const container = getContainer();
      expect(container).toBeDefined();
      expect(container.cradle.db).toBe(mockDb);
    });

    it('should return the same container instance on multiple calls', async () => {
      const { createAppContainer, getContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      await createAppContainer(mockDb as any);

      const container1 = getContainer();
      const container2 = getContainer();

      expect(container1).toBe(container2);
    });
  });

  describe('ContainerCradle interface', () => {
    it('should contain all expected properties in the cradle', async () => {
      const { createAppContainer } = await import('@core/container.js');
      
      const mockDb = { execute: vi.fn() };
      const container = await createAppContainer(mockDb as any);

      // Check registrations exist using hasRegistration method
      // Core utilities
      expect(container.hasRegistration('logger')).toBe(true);
      expect(container.hasRegistration('db')).toBe(true);

      // Repositories
      expect(container.hasRegistration('videosRepository')).toBe(true);
      expect(container.hasRegistration('commentsRepository')).toBe(true);
      expect(container.hasRegistration('reportsVideosRepository')).toBe(true);
      expect(container.hasRegistration('reportsCommentsRepository')).toBe(true);
      expect(container.hasRegistration('reportsArchiveVideosRepository')).toBe(true);
      expect(container.hasRegistration('reportsArchiveCommentsRepository')).toBe(true);
      expect(container.hasRegistration('liveChatMessagesRepository')).toBe(true);
      expect(container.hasRegistration('monetizationRepository')).toBe(true);
      expect(container.hasRegistration('linksRepository')).toBe(true);

      // Services
      expect(container.hasRegistration('videosService')).toBe(true);
      expect(container.hasRegistration('commentsService')).toBe(true);
      expect(container.hasRegistration('streamsService')).toBe(true);
      expect(container.hasRegistration('accountService')).toBe(true);
      expect(container.hasRegistration('storageService')).toBe(true);
      expect(container.hasRegistration('indexerService')).toBe(true);
      expect(container.hasRegistration('cloudflareService')).toBe(true);
      expect(container.hasRegistration('websocketService')).toBe(true);
      expect(container.hasRegistration('reportsService')).toBe(true);
      expect(container.hasRegistration('settingsService')).toBe(true);
      expect(container.hasRegistration('uploadTrackerService')).toBe(true);
      expect(container.hasRegistration('videoUploadService')).toBe(true);
      expect(container.hasRegistration('liveChatService')).toBe(true);
      expect(container.hasRegistration('linksService')).toBe(true);
      expect(container.hasRegistration('monetizationService')).toBe(true);
    });
  });
});
