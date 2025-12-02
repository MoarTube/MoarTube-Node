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
