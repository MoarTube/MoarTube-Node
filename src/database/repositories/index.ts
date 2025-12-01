/**
 * Repository barrel export
 *
 * This file exports all repository classes for convenient importing.
 */

// Base repository
export { BaseRepository } from './base.repository';

// Video repository
export { VideoRepository, type VideoQueryOptions } from './video.repository';

// Comment repository
export { CommentRepository } from './comment.repository';

// Report repositories
export { VideoReportRepository } from './video-report.repository';
export { CommentReportRepository } from './comment-report.repository';

// Archive repositories
export { VideoReportsArchiveRepository } from './video-reports-archive.repository';
export { CommentReportsArchiveRepository } from './comment-reports-archive.repository';

// Other repositories
export { LiveChatMessageRepository } from './live-chat-message.repository';
export { CryptoWalletAddressRepository } from './crypto-wallet-address.repository';
export { LinkRepository } from './link.repository';
