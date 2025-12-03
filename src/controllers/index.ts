/**
 * Controllers Module
 *
 * Barrel export for all controller classes.
 */

// Base controller
export {
  BaseController,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type PaginatedResponse,
} from './base.js';

// Individual controllers
export { StatusController } from './status.js';
export { AccountController } from './account.js';
export { VideosController } from './videos.js';
export { LinksController, type AddLinkBody, type DeleteLinkBody } from './links.js';
export {
  MonetizationController,
  type AddWalletAddressBody,
  type DeleteWalletAddressBody,
} from './monetization.js';
export { WatchEmbedController } from './watch-embed.js';
export { ExternalResourcesController } from './external-resources.js';
export { ExternalVideosController } from './external-videos.js';
export {
  CommentsController,
  type CommentSearchQuery,
  type CommentIdParams,
  type CommentReportBody,
} from './comments.js';
export { WatchController, type WatchQuery } from './watch.js';
export { NodeController, type NodeQuery, type ContentCheckedBody } from './node.js';
export { ReportsController } from './reports.js';
export {
  ReportsVideosController,
  type ArchiveReportBody,
  type ReportIdParams,
} from './reports-videos.js';
export {
  ReportsCommentsController,
  type ArchiveCommentReportBody,
  type CommentReportIdParams,
} from './reports-comments.js';
export { ReportsArchiveVideosController, type ArchiveIdParams } from './reports-archive-videos.js';
export {
  ReportsArchiveCommentsController,
  type CommentArchiveIdParams,
} from './reports-archive-comments.js';
export {
  SettingsController,
  type PersonalizeNodeNameBody,
  type PersonalizeNodeAboutBody,
  type PersonalizeNodeIdBody,
  type AccountBody,
  type NetworkInternalBody,
  type NetworkExternalBody,
  type CloudflareConfigureBody,
  type CloudflareTurnstileConfigureBody,
  type ToggleBooleanBody,
  type DatabaseConfigBody,
  type StorageConfigBody,
} from './settings.js';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from './streams.js';
