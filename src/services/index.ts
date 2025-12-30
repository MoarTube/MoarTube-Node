/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for dependency management.
 */

// Base service
export { BaseService } from './base.js';

// Service interfaces (only the actually used ones)
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

// Service implementations that are imported from this barrel
export { VideosService } from './videos.js';
export { CommentsService } from './comments.js';
export { AccountService } from './account.js';
export { CloudflareService } from './cloudflare.js';
export { ReportsService } from './reports.js';
export {
  VideoUploadService,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
} from './video-upload.js';
