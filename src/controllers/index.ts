/**
 * Controllers Module
 *
 * Barrel export for all controller classes.
 */

// Base controller
export { BaseController } from '@controllers/base.js';

// Video controller base (abstract)
export {
  VideoControllerBase,
  type VideoSource,
  type VideoSourcesResult,
  type FastifyReplyWithView,
} from '@controllers/video-controller-base.js';

// All controllers
export { StatusController } from '@controllers/status.js';
export { AccountController } from '@controllers/account.js';
export { VideosController } from '@controllers/videos.js';
export {
  CommentsController,
  type CommentSearchInput,
  type CommentIdParams,
  type CommentReportBody,
} from '@controllers/comments.js';
export { ExternalResourcesController } from '@controllers/external-resources.js';
export { ExternalVideosController } from '@controllers/external-videos.js';
export { LinksController, type AddLinkBody, type DeleteLinkBody } from '@controllers/links.js';
export {
  MonetizationController,
  type AddWalletAddressBody,
  type DeleteWalletAddressBody,
} from '@controllers/monetization.js';
export { NodeController, type NodeQuery, type ContentCheckedBody } from '@controllers/node.js';
export {
  ReportsArchiveCommentsController,
  type CommentArchiveIdParams,
} from '@controllers/reports-archive-comments.js';
export {
  ReportsArchiveVideosController,
  type ArchiveIdParams,
} from '@controllers/reports-archive-videos.js';
export {
  ReportsCommentsController,
  type ArchiveCommentReportBody,
  type CommentReportIdParams,
} from '@controllers/reports-comments.js';
export {
  ReportsVideosController,
  type ArchiveReportBody,
  type ReportIdParams,
} from '@controllers/reports-videos.js';
export { ReportsController } from '@controllers/reports.js';
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
  type SecureQuery,
} from '@controllers/settings.js';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from '@controllers/streams.js';
export { WatchController, type WatchQuery } from '@controllers/watch.js';
export { WatchEmbedController } from '@controllers/watch-embed.js';
