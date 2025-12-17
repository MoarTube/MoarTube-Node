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
  GetVideosOptions,
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
export { LiveChatService } from './live-chat.js';
export { StreamsService, type StreamMeta, type StartStreamOptions } from './streams.js';
export { AccountService } from './account.js';
export { StorageService, type S3Config } from './storage.js';
export { IndexerService } from './indexer.js';
export { CloudflareService } from './cloudflare.js';
export { WebSocketService, type WebSocketClient } from './websocket.js';
export { ReportsService } from './reports.js';
export { SettingsService } from './settings.js';
export { UploadTrackerService } from './upload-tracker.js';
export {
  VideoUploadService,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
} from './video-upload.js';
