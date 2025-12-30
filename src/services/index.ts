/**
 * Services Module
 *
 * Barrel export for all service classes and interfaces.
 * Import services from this module for dependency management.
 */

// Base service
export { BaseService } from '@services/base.js';

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
} from '@services/interfaces.js';

// Service implementations that are imported from this barrel
export { VideosService } from '@services/videos.js';
export { CommentsService } from '@services/comments.js';
export { AccountService } from '@services/account.js';
export { CloudflareService } from '@services/cloudflare.js';
export { ReportsService } from '@services/reports.js';
export {
  VideoUploadService,
  type UploadResult,
  type VideoUploadOptions,
  type StreamUploadOptions,
  type ImageUploadOptions,
} from '@services/video-upload.js';
