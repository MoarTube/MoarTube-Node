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
} from './base.controller';

// Individual controllers
export { StatusController } from './status.controller';
export { AccountController } from './account.controller';
export { VideoController } from './video.controller';
export { LinksController, type AddLinkBody, type DeleteLinkBody } from './links.controller';
export {
  MonetizationController,
  type AddWalletAddressBody,
  type DeleteWalletAddressBody,
} from './monetization.controller';
export { WatchEmbedController } from './watch-embed.controller';
export { ExternalResourcesController } from './external-resources.controller';
export { ExternalVideosController } from './external-videos.controller';
export {
  CommentsController,
  type CommentSearchQuery,
  type CommentIdParams,
  type CommentReportBody,
} from './comments.controller';
export { WatchController, type WatchQuery } from './watch.controller';
export { NodeController, type NodeQuery, type ContentCheckedBody } from './node.controller';
export { ReportsController } from './reports.controller';
export {
  ReportsVideosController,
  type ArchiveReportBody,
  type ReportIdParams,
} from './reports-videos.controller';
export {
  ReportsCommentsController,
  type ArchiveCommentReportBody,
  type CommentReportIdParams,
} from './reports-comments.controller';
export {
  ReportsArchiveVideosController,
  type ArchiveIdParams,
} from './reports-archive-videos.controller';
export {
  ReportsArchiveCommentsController,
  type CommentArchiveIdParams,
} from './reports-archive-comments.controller';
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
} from './settings.controller';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from './streams.controller';
