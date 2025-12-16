/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for dependency management.
 */

// Base service
export { BaseService } from './base.js';

// Service interfaces
export type {
  IVideoService,
  ICommentService,
  IStreamService,
  IStorageService,
  IIndexerService,
  ICloudflareService,
  IWebSocketService,
  IReportService,
  ISettingsService,
  ILiveChatService,
  GetVideosOptions,
  GetCommentsOptions,
  CreateVideoInput,
  UpdateVideoInput,
  CreateCommentInput,
  CreateChatMessageInput,
  StreamConfig,
  StorageMode,
  FileMetadata,
  WebSocketMessage,
  WebSocketEventName,
  CreateVideoReportInput,
  CreateCommentReportInput,
  UpdateNodeSettingsInput,
  DatabaseConfigInput,
  StorageConfigInput,
} from './interfaces.js';

// Service implementations
export { VideosService } from './videos.js';
export { CommentsService } from './comments.js';
export { LiveChatService } from './chat.js';
export { StreamsService, type StreamMeta, type StartStreamOptions } from './streams.js';
export { AccountService, type JwtPayload } from './account.js';
export { StorageService, type S3Config } from './storage.js';
export { IndexerService } from './indexer.js';
export { CloudflareService } from './cloudflare.js';
export { WebSocketService, type WebSocketClient } from './websocket.js';
export { ReportsService } from './reports.js';
export { SettingsService } from './settings.js';
export { UploadTrackerService, type IUploadTrackerService } from './upload-tracker.js';
export {
  VideoUploadService,
  type IVideoUploadService,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
} from './video-upload.js';
