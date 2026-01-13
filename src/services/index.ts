/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for dependency management.
 */

// Base service
export { BaseService } from '@services/base.js';

// All service interfaces
export type {
  GetVideosOptions,
  CreateVideoInput,
  UpdateVideoInput,
  VideoSource,
  VideoFormat,
  SourcesFormatsAndResolutions,
  VideoOutputs,
  VideoWatchData,
  VideoPermissions,
  VideoData,
  AddToIndexOptions,
  AddToIndexResult,
  StreamConfig,
  CreateCommentInput,
  StorageMode,
  FileMetadata,
  VideoIndexData,
  VideoUpdateData,
  RemoveFromIndexData,
  IndexerSubmitResult,
  WebSocketEventName,
  WebSocketMessage,
  ReportType,
  CreateVideoReportInput,
  CreateCommentReportInput,
  UpdateNodeSettingsInput,
  StorageConfigInput,
  JwtPayload,
  SignInInput,
  SignInResult,
  CreateChatMessageInput,
  CreateLinkInput,
  CreateWalletAddressInput,
} from '@services/interfaces.js';

// All service implementations
export { VideosService } from '@services/videos.js';
export { CommentsService } from '@services/comments.js';
export { AccountService } from '@services/account.js';
export { CloudflareService } from '@services/cloudflare.js';
export { ReportsService } from '@services/reports.js';
export { IndexerService } from '@services/indexer.js';
export { LinksService } from '@services/links.js';
export { LiveChatService } from '@services/live-chat.js';
export { MonetizationService } from '@services/monetization.js';
export { SettingsService } from '@services/settings.js';
export { StorageService, type S3Config } from '@services/storage.js';
export { StreamsService, type StreamMeta, type StartStreamOptions } from '@services/streams.js';
export { UploadTrackerService } from '@services/upload-tracker.js';
export { WebSocketService } from '@services/websocket.js';
export {
  VideoUploadService,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
  type ImageType,
} from '@services/video-upload.js';
