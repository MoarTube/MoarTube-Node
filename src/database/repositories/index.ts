/**
 * Repository barrel export
 *
 * This file exports all repository classes for convenient importing.
 */

// Videos repository
export {
  createVideosRepository,
  type IVideosRepository,
  type VideoQueryOptions,
} from '@database/repositories/videos/index.js';

// Comments repository
export {
  createCommentsRepository,
  type ICommentsRepository,
} from '@database/repositories/comments/index.js';

// Report repositories
export {
  createReportsVideosRepository,
  type IReportsVideosRepository,
} from '@database/repositories/reports-videos/index.js';
export {
  createReportsCommentsRepository,
  type IReportsCommentsRepository,
} from '@database/repositories/reports-comments/index.js';

// Archive repositories
export {
  createReportsArchiveVideosRepository,
  type IReportsArchiveVideosRepository,
} from '@database/repositories/reports-archive-videos/index.js';
export {
  createReportsArchiveCommentsRepository,
  type IReportsArchiveCommentsRepository,
} from '@database/repositories/reports-archive-comments/index.js';

// Other repositories
export {
  createLiveChatMessagesRepository,
  type ILiveChatMessagesRepository,
} from '@database/repositories/live-chat-messages/index.js';
export {
  createMonetizationRepository,
  type IMonetizationRepository,
} from '@database/repositories/monetization/index.js';
export {
  createLinksRepository,
  type ILinksRepository,
} from '@database/repositories/links/index.js';
