/**
 * Schema barrel export for Drizzle ORM
 *
 * This file exports all table schemas and their inferred types for use throughout
 * the application. Import from this file rather than individual schema files.
 */

// Video schema
export {
  videos,
  type DrizzleVideo,
  type DrizzleNewVideo,
} from '@database/schemas/sqlite/videos.js';

// Comment schema
export {
  comments,
  type DrizzleComment,
  type DrizzleNewComment,
} from '@database/schemas/sqlite/comments.js';

// Video reports schema
export {
  videoReports,
  type DrizzleVideoReport,
  type DrizzleNewVideoReport,
} from '@database/schemas/sqlite/reports-videos.js';

// Comment reports schema
export {
  commentReports,
  type DrizzleCommentReport,
  type DrizzleNewCommentReport,
} from '@database/schemas/sqlite/reports-comments.js';

// Video reports archive schema
export {
  videoReportsArchive,
  type DrizzleVideoReportArchive,
  type DrizzleNewVideoReportArchive,
} from '@database/schemas/sqlite/reports-archive-videos.js';

// Comment reports archive schema
export {
  commentReportsArchive,
  type DrizzleCommentReportArchive,
  type DrizzleNewCommentReportArchive,
} from '@database/schemas/sqlite/reports-archive-comments.js';

// Live chat messages schema
export {
  liveChatMessages,
  type DrizzleLiveChatMessage,
  type DrizzleNewLiveChatMessage,
} from '@database/schemas/sqlite/live-chat-messages.js';

// Monetization schema (crypto wallet addresses)
export {
  cryptoWalletAddresses,
  type DrizzleCryptoWalletAddress,
  type DrizzleNewCryptoWalletAddress,
} from '@database/schemas/sqlite/monetization.js';

// Links schema
export { links, type DrizzleLink, type DrizzleNewLink } from '@database/schemas/sqlite/links.js';
