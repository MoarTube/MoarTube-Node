/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for clean dependency management.
 */

// Base service
export { BaseService, type ServiceOptions, type ServiceLogger } from './base.service';

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
} from './interfaces';

// Service implementations
export { VideoService, type VideoServiceDependencies } from './video.service';
export { CommentService, type CommentServiceDependencies } from './comment.service';
export {
  StreamService,
  type StreamServiceDependencies,
  type StreamMeta,
  type StartStreamOptions,
} from './stream.service';
export { AuthService, type JwtPayload } from './auth.service';
export { StorageService, type S3Config } from './storage.service';
export { IndexerService, type VideoIndexData } from './indexer.service';
export { CloudflareService, type CloudflareServiceDependencies } from './cloudflare.service';
export { WebSocketService, type WebSocketClient } from './websocket.service';
export { ReportService, type ReportServiceDependencies } from './report.service';
export { SettingsService, type SettingsServiceDependencies } from './settings.service';
