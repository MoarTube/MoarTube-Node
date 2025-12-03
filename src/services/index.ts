/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for clean dependency management.
 */

// Base service
export { BaseService, type ServiceOptions, type ServiceLogger } from './base.js';

// Service interfaces
export type {
  IVideoService,
  ICommentService,
  IStreamService,
  IAuthService,
  IStorageService,
  IIndexerService,
  ICloudflareService,
  IWebSocketService,
  IReportService,
  ISettingsService,
  GetVideosOptions,
  GetCommentsOptions,
  CreateVideoInput,
  UpdateVideoInput,
  CreateCommentInput,
  StreamConfig,
  SignInInput,
  SignInResult,
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
export { VideosService, type VideosServiceDependencies } from './videos.js';
export { CommentService, type CommentServiceDependencies } from './comment.js';
export {
  StreamService,
  type StreamServiceDependencies,
  type StreamMeta,
  type StartStreamOptions,
} from './stream.js';
export { AuthService, type JwtPayload } from './auth.js';
export { StorageService, type S3Config } from './storage.js';
export { IndexerService } from './indexer.js';
export { CloudflareService, type CloudflareServiceDependencies } from './cloudflare.js';
export { WebSocketService, type WebSocketClient } from './websocket.js';
export { ReportService, type ReportServiceDependencies } from './report.js';
export { SettingsService, type SettingsServiceDependencies } from './settings.js';
export {
  UploadTrackerService,
  type IUploadTrackerService,
  type UploadTrackerServiceDependencies,
} from './upload-tracker.js';
export {
  VideoUploadService,
  type IVideoUploadService,
  type VideoUploadServiceDependencies,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
} from './video-upload.js';
