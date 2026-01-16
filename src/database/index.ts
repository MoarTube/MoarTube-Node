/**
 * Database module barrel export
 *
 * This file exports all database-related modules for convenient importing.
 */

// Connection management
export {
  createDatabase,
  initializeDatabaseSchema,
  getDatabase,
  type DatabaseConfig,
  type DatabaseClient,
} from '@database/connection.js';

// Repository interfaces and factories
export {
  createVideosRepository,
  type IVideosRepository,
  createCommentsRepository,
  type ICommentsRepository,
  createReportsVideosRepository,
  type IReportsVideosRepository,
  createReportsCommentsRepository,
  type IReportsCommentsRepository,
  createReportsArchiveVideosRepository,
  type IReportsArchiveVideosRepository,
  createReportsArchiveCommentsRepository,
  type IReportsArchiveCommentsRepository,
  createLiveChatMessagesRepository,
  type ILiveChatMessagesRepository,
  createMonetizationRepository,
  type IMonetizationRepository,
  createLinksRepository,
  type ILinksRepository,
} from '@database/repositories/index.js';

// Schema types for SQLite
export type {
  DrizzleVideo as SQLiteVideo,
  DrizzleNewVideo as SQLiteNewVideo,
  DrizzleComment as SQLiteComment,
  DrizzleNewComment as SQLiteNewComment,
  DrizzleVideoReport as SQLiteVideoReport,
  DrizzleNewVideoReport as SQLiteNewVideoReport,
  DrizzleCommentReport as SQLiteCommentReport,
  DrizzleNewCommentReport as SQLiteNewCommentReport,
  DrizzleVideoReportArchive as SQLiteVideoReportArchive,
  DrizzleNewVideoReportArchive as SQLiteNewVideoReportArchive,
  DrizzleCommentReportArchive as SQLiteCommentReportArchive,
  DrizzleNewCommentReportArchive as SQLiteNewCommentReportArchive,
  DrizzleLiveChatMessage as SQLiteLiveChatMessage,
  DrizzleNewLiveChatMessage as SQLiteNewLiveChatMessage,
  DrizzleCryptoWalletAddress as SQLiteCryptoWalletAddress,
  DrizzleNewCryptoWalletAddress as SQLiteNewCryptoWalletAddress,
  DrizzleLink as SQLiteLink,
  DrizzleNewLink as SQLiteNewLink,
} from '@database/schemas/sqlite/index.js';

// Schema types for Postgres
export type {
  DrizzleVideo as PostgresVideo,
  DrizzleNewVideo as PostgresNewVideo,
  DrizzleComment as PostgresComment,
  DrizzleNewComment as PostgresNewComment,
  DrizzleVideoReport as PostgresVideoReport,
  DrizzleNewVideoReport as PostgresNewVideoReport,
  DrizzleCommentReport as PostgresCommentReport,
  DrizzleNewCommentReport as PostgresNewCommentReport,
  DrizzleVideoReportArchive as PostgresVideoReportArchive,
  DrizzleNewVideoReportArchive as PostgresNewVideoReportArchive,
  DrizzleCommentReportArchive as PostgresCommentReportArchive,
  DrizzleNewCommentReportArchive as PostgresNewCommentReportArchive,
  DrizzleLiveChatMessage as PostgresLiveChatMessage,
  DrizzleNewLiveChatMessage as PostgresNewLiveChatMessage,
  DrizzleCryptoWalletAddress as PostgresCryptoWalletAddress,
  DrizzleNewCryptoWalletAddress as PostgresNewCryptoWalletAddress,
  DrizzleLink as PostgresLink,
  DrizzleNewLink as PostgresNewLink,
} from '@database/schemas/postgres/index.js';
