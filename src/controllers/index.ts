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
} from './base';

// Individual controllers
export { StatusController } from './status';
export { AccountController } from './account';
export { VideosController } from './videos';
export { LinksController, type AddLinkBody, type DeleteLinkBody } from './links';
export {
  MonetizationController,
  type AddWalletAddressBody,
  type DeleteWalletAddressBody,
} from './monetization';
export { WatchEmbedController } from './watch-embed';
export { ExternalResourcesController } from './external-resources';
export { ExternalVideosController } from './external-videos';
export {
  CommentsController,
  type CommentSearchQuery,
  type CommentIdParams,
  type CommentReportBody,
} from './comments';
export { WatchController, type WatchQuery } from './watch';
export { NodeController, type NodeQuery, type ContentCheckedBody } from './node';
export { ReportsController } from './reports';
export {
  ReportsVideosController,
  type ArchiveReportBody,
  type ReportIdParams,
} from './reports-videos';
export {
  ReportsCommentsController,
  type ArchiveCommentReportBody,
  type CommentReportIdParams,
} from './reports-comments';
export { ReportsArchiveVideosController, type ArchiveIdParams } from './reports-archive-videos';
export {
  ReportsArchiveCommentsController,
  type CommentArchiveIdParams,
} from './reports-archive-comments';
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
} from './settings';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from './streams';
