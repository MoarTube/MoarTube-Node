/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for clean dependency management.
 */

// Base service
export { BaseService, type ServiceOptions, type ServiceLogger } from './base';

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
export { VideosService, type VideosServiceDependencies } from './videos';
export { CommentService, type CommentServiceDependencies } from './comment';
export {
  StreamService,
  type StreamServiceDependencies,
  type StreamMeta,
  type StartStreamOptions,
} from './stream';
export { AuthService, type JwtPayload } from './auth';
export { StorageService, type S3Config } from './storage';
export { IndexerService, type VideoIndexData } from './indexer';
export { CloudflareService, type CloudflareServiceDependencies } from './cloudflare';
export { WebSocketService, type WebSocketClient } from './websocket';
export { ReportService, type ReportServiceDependencies } from './report';
export { SettingsService, type SettingsServiceDependencies } from './settings';
