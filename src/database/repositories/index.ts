/**
 * Repository barrel export
 *
 * This file exports all repository classes for convenient importing.
 */

// Videos repository
export { createVideosRepository, type IVideosRepository, type VideoQueryOptions, type SQLiteVideo, type SQLiteNewVideo, type PostgresVideo, type PostgresNewVideo } from '@database/repositories/videos/index.js';

// Comments repository
export { createCommentsRepository, type ICommentsRepository, type SQLiteComment, type SQLiteNewComment, type PostgresComment, type PostgresNewComment } from '@database/repositories/comments/index.js';

// Report repositories
export { createReportsVideosRepository, type IReportsVideosRepository, type SQLiteVideoReport, type SQLiteNewVideoReport, type PostgresVideoReport, type PostgresNewVideoReport } from '@database/repositories/reports-videos/index.js';
export { createReportsCommentsRepository, type IReportsCommentsRepository, type SQLiteCommentReport, type SQLiteNewCommentReport, type PostgresCommentReport, type PostgresNewCommentReport } from '@database/repositories/reports-comments/index.js';

// Archive repositories
export { createReportsArchiveVideosRepository, type IReportsArchiveVideosRepository, type SQLiteVideoReportArchive, type SQLiteNewVideoReportArchive, type PostgresVideoReportArchive, type PostgresNewVideoReportArchive } from '@database/repositories/reports-archive-videos/index.js';
export { createReportsArchiveCommentsRepository, type IReportsArchiveCommentsRepository, type SQLiteCommentReportArchive, type SQLiteNewCommentReportArchive, type PostgresCommentReportArchive, type PostgresNewCommentReportArchive } from '@database/repositories/reports-archive-comments/index.js';

// Other repositories
export { createLiveChatMessagesRepository, type ILiveChatMessagesRepository, type SQLiteLiveChatMessage, type SQLiteNewLiveChatMessage, type PostgresLiveChatMessage, type PostgresNewLiveChatMessage } from '@database/repositories/live-chat-messages/index.js';
export { createMonetizationRepository, type IMonetizationRepository, type SQLiteCryptoWalletAddress, type SQLiteNewCryptoWalletAddress, type PostgresCryptoWalletAddress, type PostgresNewCryptoWalletAddress } from '@database/repositories/monetization/index.js';
export { createLinksRepository, type ILinksRepository, type SQLiteLink, type SQLiteNewLink, type PostgresLink, type PostgresNewLink } from '@database/repositories/links/index.js';
