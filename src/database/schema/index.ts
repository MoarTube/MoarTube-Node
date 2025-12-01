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
export { videoReports, type DrizzleVideoReport, type DrizzleNewVideoReport } from './video-reports';

// Comment reports schema
export {
  commentReports,
  type DrizzleCommentReport,
  type DrizzleNewCommentReport,
} from './comment-reports';

// Video reports archive schema
export {
  videoReportsArchive,
  type DrizzleVideoReportArchive,
  type DrizzleNewVideoReportArchive,
} from './video-reports-archive';

// Comment reports archive schema
export {
  commentReportsArchive,
  type DrizzleCommentReportArchive,
  type DrizzleNewCommentReportArchive,
} from './comment-reports-archive';

// Live chat messages schema
export {
  liveChatMessages,
  type DrizzleLiveChatMessage,
  type DrizzleNewLiveChatMessage,
} from './live-chat-messages';

// Crypto wallet addresses schema
export {
  cryptoWalletAddresses,
  type DrizzleCryptoWalletAddress,
  type DrizzleNewCryptoWalletAddress,
} from './crypto-wallet-addresses';

// Links schema
export { links, type DrizzleLink, type DrizzleNewLink } from './links';
