/**
 * Schema barrel export for Drizzle ORM
 *
 * This file exports all table schemas and their inferred types for use throughout
 * the application. Import from this file rather than individual schema files.
 */

// Video schema
export { videos, type DrizzleVideo, type DrizzleNewVideo } from './videos.js';

// Comment schema
export { comments, type DrizzleComment, type DrizzleNewComment } from './comments.js';

// Video reports schema
export {
  videoReports,
  type DrizzleVideoReport,
  type DrizzleNewVideoReport,
} from './reports-videos.js';

// Comment reports schema
export {
  commentReports,
  type DrizzleCommentReport,
  type DrizzleNewCommentReport,
} from './reports-comments.js';

// Video reports archive schema
export {
  videoReportsArchive,
  type DrizzleVideoReportArchive,
  type DrizzleNewVideoReportArchive,
} from './reports-archive-videos.js';

// Comment reports archive schema
export {
  commentReportsArchive,
  type DrizzleCommentReportArchive,
  type DrizzleNewCommentReportArchive,
} from './reports-archive-comments.js';

// Live chat messages schema
export {
  liveChatMessages,
  type DrizzleLiveChatMessage,
  type DrizzleNewLiveChatMessage,
} from './live-chat-messages.js';

// Monetization schema (crypto wallet addresses)
export {
  cryptoWalletAddresses,
  type DrizzleCryptoWalletAddress,
  type DrizzleNewCryptoWalletAddress,
} from './monetization.js';

// Links schema
export { links, type DrizzleLink, type DrizzleNewLink } from './links.js';
