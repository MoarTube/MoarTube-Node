/**
 * Schema barrel export for Drizzle ORM
 *
 * This file exports all table schemas and their inferred types for use throughout
 * the application. Import from this file rather than individual schema files.
 */

// Video schema
export { videos, type DrizzleVideo, type DrizzleNewVideo } from './videos';

// Comment schema
export { comments, type DrizzleComment, type DrizzleNewComment } from './comments';

// Video reports schema
export {
  videoReports,
  type DrizzleVideoReport,
  type DrizzleNewVideoReport,
} from './reports-videos';

// Comment reports schema
export {
  commentReports,
  type DrizzleCommentReport,
  type DrizzleNewCommentReport,
} from './reports-comments';

// Video reports archive schema
export {
  videoReportsArchive,
  type DrizzleVideoReportArchive,
  type DrizzleNewVideoReportArchive,
} from './reports-archive-videos';

// Comment reports archive schema
export {
  commentReportsArchive,
  type DrizzleCommentReportArchive,
  type DrizzleNewCommentReportArchive,
} from './reports-archive-comments';

// Live chat messages schema
export {
  liveChatMessages,
  type DrizzleLiveChatMessage,
  type DrizzleNewLiveChatMessage,
} from './live-chat-messages';

// Monetization schema (crypto wallet addresses)
export {
  cryptoWalletAddresses,
  type DrizzleCryptoWalletAddress,
  type DrizzleNewCryptoWalletAddress,
} from './monetization';

// Links schema
export { links, type DrizzleLink, type DrizzleNewLink } from './links';
