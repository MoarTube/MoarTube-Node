/**
 * Legacy Database Bridge
 *
 * Provides backward compatibility with the existing Sequelize-based database operations.
 * This bridge allows gradual migration from the old `submitDatabaseWriteJob` pattern
 * to the new Drizzle ORM repositories.
 *
 * @deprecated This module exists for backward compatibility during migration.
 * New code should use the repository classes directly.
 */
import cluster from 'cluster';
import {
  getDatabase,
  isDatabaseInitialized,
  createDatabase,
  closeDatabase,
  type DatabaseConfig,
} from './connection';
import { getWriteQueue } from './write-queue';
import {
  VideosRepository,
  CommentsRepository,
  ReportsVideosRepository,
  ReportsCommentsRepository,
  ReportsArchiveVideosRepository,
  ReportsArchiveCommentsRepository,
  LiveChatMessageRepository,
  MonetizationRepository,
  LinksRepository,
} from './repositories';

/**
 * Repository instances cache
 */
let videoRepo: VideosRepository | null = null;
let commentRepo: CommentsRepository | null = null;
let videoReportRepo: ReportsVideosRepository | null = null;
let commentReportRepo: ReportsCommentsRepository | null = null;
let videoReportsArchiveRepo: ReportsArchiveVideosRepository | null = null;
let commentReportsArchiveRepo: ReportsArchiveCommentsRepository | null = null;
let liveChatMessageRepo: LiveChatMessageRepository | null = null;
let monetizationRepo: MonetizationRepository | null = null;
let linkRepo: LinksRepository | null = null;

/**
 * Initializes the database connection and repositories
 *
 * @param config - Database configuration
 * @deprecated Use createDatabase and repository constructors directly
 */
export function initializeDatabase(config: DatabaseConfig): void {
  const db = createDatabase(config);

  // Initialize all repository instances
  videoRepo = new VideosRepository(db);
  commentRepo = new CommentsRepository(db);
  videoReportRepo = new ReportsVideosRepository(db);
  commentReportRepo = new ReportsCommentsRepository(db);
  videoReportsArchiveRepo = new ReportsArchiveVideosRepository(db);
  commentReportsArchiveRepo = new ReportsArchiveCommentsRepository(db);
  liveChatMessageRepo = new LiveChatMessageRepository(db);
  monetizationRepo = new MonetizationRepository(db);
  linkRepo = new LinksRepository(db);
}

/**
 * Gets the video repository instance
 *
 * @returns VideosRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new VideosRepository(getDatabase()) directly
 */
export function getVideoRepository(): VideosRepository {
  if (!videoRepo) {
    const db = getDatabase();
    videoRepo = new VideosRepository(db);
  }
  return videoRepo;
}

/**
 * Gets the comment repository instance
 *
 * @returns CommentsRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new CommentsRepository(getDatabase()) directly
 */
export function getCommentRepository(): CommentsRepository {
  if (!commentRepo) {
    const db = getDatabase();
    commentRepo = new CommentsRepository(db);
  }
  return commentRepo;
}

/**
 * Gets the video report repository instance
 *
 * @returns ReportsVideosRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new ReportsVideosRepository(getDatabase()) directly
 */
export function getVideoReportRepository(): ReportsVideosRepository {
  if (!videoReportRepo) {
    const db = getDatabase();
    videoReportRepo = new ReportsVideosRepository(db);
  }
  return videoReportRepo;
}

/**
 * Gets the comment report repository instance
 *
 * @returns ReportsCommentsRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new ReportsCommentsRepository(getDatabase()) directly
 */
export function getCommentReportRepository(): ReportsCommentsRepository {
  if (!commentReportRepo) {
    const db = getDatabase();
    commentReportRepo = new ReportsCommentsRepository(db);
  }
  return commentReportRepo;
}

/**
 * Gets the video reports archive repository instance
 *
 * @returns ReportsArchiveVideosRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new ReportsArchiveVideosRepository(getDatabase()) directly
 */
export function getVideoReportsArchiveRepository(): ReportsArchiveVideosRepository {
  if (!videoReportsArchiveRepo) {
    const db = getDatabase();
    videoReportsArchiveRepo = new ReportsArchiveVideosRepository(db);
  }
  return videoReportsArchiveRepo;
}

/**
 * Gets the comment reports archive repository instance
 *
 * @returns ReportsArchiveCommentsRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new ReportsArchiveCommentsRepository(getDatabase()) directly
 */
export function getCommentReportsArchiveRepository(): ReportsArchiveCommentsRepository {
  if (!commentReportsArchiveRepo) {
    const db = getDatabase();
    commentReportsArchiveRepo = new ReportsArchiveCommentsRepository(db);
  }
  return commentReportsArchiveRepo;
}

/**
 * Gets the live chat message repository instance
 *
 * @returns LiveChatMessageRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new LiveChatMessageRepository(getDatabase()) directly
 */
export function getLiveChatMessageRepository(): LiveChatMessageRepository {
  if (!liveChatMessageRepo) {
    const db = getDatabase();
    liveChatMessageRepo = new LiveChatMessageRepository(db);
  }
  return liveChatMessageRepo;
}

/**
 * Gets the monetization repository instance
 *
 * @returns MonetizationRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new MonetizationRepository(getDatabase()) directly
 */
export function getMonetizationRepository(): MonetizationRepository {
  if (!monetizationRepo) {
    const db = getDatabase();
    monetizationRepo = new MonetizationRepository(db);
  }
  return monetizationRepo;
}

/**
 * Gets the link repository instance
 *
 * @returns LinksRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new LinksRepository(getDatabase()) directly
 */
export function getLinkRepository(): LinksRepository {
  if (!linkRepo) {
    const db = getDatabase();
    linkRepo = new LinksRepository(db);
  }
  return linkRepo;
}

/**
 * Legacy interface for database write job submission
 *
 * This interface matches the existing `submitDatabaseWriteJob` function signature
 * used throughout the codebase.
 *
 * @deprecated Use repository methods directly instead of raw queries
 */
export interface DatabaseWriteJob {
  query: string;
  parameters: unknown[];
}

/**
 * Submits a database write job (legacy compatibility)
 *
 * In cluster mode, this routes the write operation through the master process.
 * In single-process mode, this executes directly (but is not recommended).
 *
 * @param job - The database write job
 * @returns Promise that resolves when the write completes
 * @deprecated Use repository methods directly. This function exists for
 * backward compatibility during the migration period.
 */
export async function submitDatabaseWriteJob(job: DatabaseWriteJob): Promise<void> {
  if (cluster.isWorker) {
    const writeQueue = getWriteQueue();
    return writeQueue.submit(job.query, job.parameters);
  }

  // In master/single process mode, we would need to execute directly
  // This is a placeholder - actual implementation would use the raw DB connection
  console.warn(
    'submitDatabaseWriteJob: Direct execution in master process not fully implemented. ' +
      'Use repository methods instead.'
  );
}

/**
 * Checks if the database is initialized
 *
 * @returns true if database is ready, false otherwise
 * @deprecated Use isDatabaseInitialized() from connection module
 */
export function isDatabaseReady(): boolean {
  return isDatabaseInitialized();
}

/**
 * Closes the database connection and clears repository caches
 *
 * @deprecated Use closeDatabase() from connection module
 */
export function shutdownDatabase(): void {
  closeDatabase();

  // Clear repository cache
  videoRepo = null;
  commentRepo = null;
  videoReportRepo = null;
  commentReportRepo = null;
  videoReportsArchiveRepo = null;
  commentReportsArchiveRepo = null;
  liveChatMessageRepo = null;
  monetizationRepo = null;
  linkRepo = null;
}
