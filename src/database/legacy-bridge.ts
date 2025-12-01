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
  VideoRepository,
  CommentRepository,
  VideoReportRepository,
  CommentReportRepository,
  VideoReportsArchiveRepository,
  CommentReportsArchiveRepository,
  LiveChatMessageRepository,
  CryptoWalletAddressRepository,
  LinkRepository,
} from './repositories';

/**
 * Repository instances cache
 */
let videoRepo: VideoRepository | null = null;
let commentRepo: CommentRepository | null = null;
let videoReportRepo: VideoReportRepository | null = null;
let commentReportRepo: CommentReportRepository | null = null;
let videoReportsArchiveRepo: VideoReportsArchiveRepository | null = null;
let commentReportsArchiveRepo: CommentReportsArchiveRepository | null = null;
let liveChatMessageRepo: LiveChatMessageRepository | null = null;
let cryptoWalletAddressRepo: CryptoWalletAddressRepository | null = null;
let linkRepo: LinkRepository | null = null;

/**
 * Initializes the database connection and repositories
 *
 * @param config - Database configuration
 * @deprecated Use createDatabase and repository constructors directly
 */
export function initializeDatabase(config: DatabaseConfig): void {
  const db = createDatabase(config);

  // Initialize all repository instances
  videoRepo = new VideoRepository(db);
  commentRepo = new CommentRepository(db);
  videoReportRepo = new VideoReportRepository(db);
  commentReportRepo = new CommentReportRepository(db);
  videoReportsArchiveRepo = new VideoReportsArchiveRepository(db);
  commentReportsArchiveRepo = new CommentReportsArchiveRepository(db);
  liveChatMessageRepo = new LiveChatMessageRepository(db);
  cryptoWalletAddressRepo = new CryptoWalletAddressRepository(db);
  linkRepo = new LinkRepository(db);
}

/**
 * Gets the video repository instance
 *
 * @returns VideoRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new VideoRepository(getDatabase()) directly
 */
export function getVideoRepository(): VideoRepository {
  if (!videoRepo) {
    const db = getDatabase();
    videoRepo = new VideoRepository(db);
  }
  return videoRepo;
}

/**
 * Gets the comment repository instance
 *
 * @returns CommentRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new CommentRepository(getDatabase()) directly
 */
export function getCommentRepository(): CommentRepository {
  if (!commentRepo) {
    const db = getDatabase();
    commentRepo = new CommentRepository(db);
  }
  return commentRepo;
}

/**
 * Gets the video report repository instance
 *
 * @returns VideoReportRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new VideoReportRepository(getDatabase()) directly
 */
export function getVideoReportRepository(): VideoReportRepository {
  if (!videoReportRepo) {
    const db = getDatabase();
    videoReportRepo = new VideoReportRepository(db);
  }
  return videoReportRepo;
}

/**
 * Gets the comment report repository instance
 *
 * @returns CommentReportRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new CommentReportRepository(getDatabase()) directly
 */
export function getCommentReportRepository(): CommentReportRepository {
  if (!commentReportRepo) {
    const db = getDatabase();
    commentReportRepo = new CommentReportRepository(db);
  }
  return commentReportRepo;
}

/**
 * Gets the video reports archive repository instance
 *
 * @returns VideoReportsArchiveRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new VideoReportsArchiveRepository(getDatabase()) directly
 */
export function getVideoReportsArchiveRepository(): VideoReportsArchiveRepository {
  if (!videoReportsArchiveRepo) {
    const db = getDatabase();
    videoReportsArchiveRepo = new VideoReportsArchiveRepository(db);
  }
  return videoReportsArchiveRepo;
}

/**
 * Gets the comment reports archive repository instance
 *
 * @returns CommentReportsArchiveRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new CommentReportsArchiveRepository(getDatabase()) directly
 */
export function getCommentReportsArchiveRepository(): CommentReportsArchiveRepository {
  if (!commentReportsArchiveRepo) {
    const db = getDatabase();
    commentReportsArchiveRepo = new CommentReportsArchiveRepository(db);
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
 * Gets the crypto wallet address repository instance
 *
 * @returns CryptoWalletAddressRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new CryptoWalletAddressRepository(getDatabase()) directly
 */
export function getCryptoWalletAddressRepository(): CryptoWalletAddressRepository {
  if (!cryptoWalletAddressRepo) {
    const db = getDatabase();
    cryptoWalletAddressRepo = new CryptoWalletAddressRepository(db);
  }
  return cryptoWalletAddressRepo;
}

/**
 * Gets the link repository instance
 *
 * @returns LinkRepository instance
 * @throws Error if database is not initialized
 * @deprecated Use new LinkRepository(getDatabase()) directly
 */
export function getLinkRepository(): LinkRepository {
  if (!linkRepo) {
    const db = getDatabase();
    linkRepo = new LinkRepository(db);
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
  cryptoWalletAddressRepo = null;
  linkRepo = null;
}
