/**
 * Service Layer Interfaces
 *
 * This file defines the contracts for all service classes in the application.
 * Services encapsulate business logic and coordinate between repositories,
 * external APIs, and other services.
 */

import type {
  DrizzleVideo,
  DrizzleComment,
  DrizzleVideoReport,
  DrizzleCommentReport,
  DrizzleVideoReportArchive,
  DrizzleCommentReportArchive,
  DrizzleLiveChatMessage,
  DrizzleCryptoWalletAddress,
  DrizzleLink,
} from '../database/schemas/index.js';
import type { PaginationOptions, PaginatedResult } from '../types/models.js';

// ============================================================================
// Video Service
// ============================================================================

/**
 * Options for filtering video queries
 */
export interface GetVideosOptions extends PaginationOptions {
  /** Sort field */
  sortBy?: 'creation_timestamp' | 'views' | 'likes' | 'title';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Filter by published status */
  isPublished?: boolean;
  /** Filter by streaming status */
  isStreaming?: boolean;
  /** Filter by finalized status */
  isFinalized?: boolean;
  /** Search in title, description, or tags */
  search?: string;
  /** Filter by specific tag */
  tagTerm?: string;
  /** Timestamp for pagination */
  timestamp?: number;
}

/**
 * Input for creating a new video (import)
 */
export interface CreateVideoInput {
  title: string;
  description: string;
  tags: string;
}

/**
 * Input for updating video metadata
 */
export interface UpdateVideoInput {
  title?: string;
  description?: string;
  tags?: string;
  isPublished?: boolean;
  isHidden?: boolean;
  isPassworded?: boolean;
  password?: string;
  isCommentsEnabled?: boolean;
  isLikesEnabled?: boolean;
  isDislikesEnabled?: boolean;
  isReportsEnabled?: boolean;
  isLiveChatEnabled?: boolean;
}

/**
 * Video with additional computed metadata
 */
export interface VideoWithMeta extends DrizzleVideo {
  thumbnailBase64?: string;
}

/**
 * Video source for media player
 */
export interface VideoSource {
  src: string;
  type: string;
}

/**
 * Sources by format and resolution
 */
export interface SourcesFormatsAndResolutions {
  m3u8: string[];
  mp4: string[];
  webm: string[];
  ogv: string[];
}

/**
 * Video watch data for media player
 */
export interface VideoWatchData {
  videoId: string;
  title: string;
  description: string;
  views: number;
  likes: number;
  dislikes: number;
  isPublished: boolean;
  isPublishing: boolean;
  isLive: boolean;
  isStreaming: boolean;
  isStreamed: boolean;
  comments: number;
  creationTimestamp: number;
  isHlsAvailable: boolean;
  isMp4Available: boolean;
  isWebmAvailable: boolean;
  isOgvAvailable: boolean;
  adaptiveSources: VideoSource[];
  progressiveSources: VideoSource[];
  sourcesFormatsAndResolutions: SourcesFormatsAndResolutions;
}

/**
 * Video permissions
 */
export interface VideoPermissions {
  isCommentsEnabled: boolean;
  isLikesEnabled: boolean;
  isDislikesEnabled: boolean;
  isReportsEnabled: boolean;
  isLiveChatEnabled: boolean;
}

/**
 * Video data with formatted fields for API responses
 */
export interface VideoData {
  videoId: string;
  title: string;
  description: string;
  tags: string;
  views: number;
  isIndexed: boolean;
  isPublished: boolean;
  isLive: boolean;
  isStreaming: boolean;
  isFinalized: boolean;
  isStreamRecordedRemotely: boolean;
  timestamp: number;
  videoAliasUrl: string;
  outputs: Record<string, string[]>;
  meta: Record<string, unknown>;
}

/**
 * Video service interface
 */
export interface IVideoService {
  /** Get a single video by ID */
  getVideo(videoId: string): Promise<DrizzleVideo | null>;

  /** Get videos with filtering and pagination */
  getVideos(options?: GetVideosOptions): Promise<PaginatedResult<DrizzleVideo>>;

  /** Count videos with filtering */
  countVideos(options?: GetVideosOptions): Promise<number>;

  /** Create a new video (import) */
  createVideo(data: CreateVideoInput): Promise<{ videoId: string }>;

  /** Update video metadata */
  updateVideo(videoId: string, data: UpdateVideoInput): Promise<DrizzleVideo | null>;

  /** Update video meta field */
  updateVideoMeta(videoId: string, meta: Record<string, unknown>): Promise<DrizzleVideo | null>;

  /** Delete a video and all associated data */
  deleteVideo(videoId: string): Promise<boolean>;

  /** Mark video as importing */
  setImporting(videoId: string, isImporting: boolean): Promise<void>;

  /** Mark video as imported */
  setImported(videoId: string): Promise<void>;

  /** Mark video as publishing */
  setPublishing(videoId: string, isPublishing: boolean): Promise<void>;

  /** Publish a video */
  publishVideo(videoId: string): Promise<void>;

  /** Unpublish a video */
  unpublishVideo(videoId: string): Promise<void>;

  /** Increment view count */
  incrementViews(videoId: string): Promise<void>;

  /** Increment view count with debouncing for batched DB writes */
  incrementViewsDebounced(videoId: string): Promise<{ views: number }>;

  /** Increment like count */
  incrementLikes(videoId: string): Promise<void>;

  /** Increment dislike count */
  incrementDislikes(videoId: string): Promise<void>;

  /** Finalize a video */
  finalizeVideo(videoId: string): Promise<void>;

  /** Set video error state */
  setError(videoId: string, isError: boolean): Promise<void>;

  /** Get videos pending indexing */
  getVideosNeedingIndexing(): Promise<DrizzleVideo[]>;

  /** Mark video as indexed */
  setIndexed(videoId: string, isIndexed: boolean): Promise<void>;

  /** Update video bandwidth */
  updateBandwidth(videoId: string, bandwidth: number): Promise<void>;

  /** Mark video index as outdated */
  setIndexOutdated(videoId: string): Promise<void>;

  /** Set video length (seconds and timestamp) */
  setVideoLength(videoId: string, lengthSeconds: number, lengthTimestamp: string): Promise<void>;

  /** Add a resolution to video outputs */
  addOutputResolution(videoId: string, format: string, resolution: string): Promise<void>;

  /** Mark specific format/resolution as published */
  markFormatResolutionPublished(videoId: string, format: string, resolution: string): Promise<void>;

  /** Notify upload complete for a format/resolution */
  notifyUploadComplete(videoId: string, format: string, resolution: string): Promise<void>;

  /** Notify stream complete for a format/resolution */
  notifyStreamComplete(videoId: string, format: string, resolution: string): Promise<void>;

  /** Set source file extension */
  setSourceFileExtension(videoId: string, extension: string): Promise<void>;

  /** Get source file extension */
  getSourceFileExtension(videoId: string): Promise<string | null>;

  /** Get all publish statuses for video formats/resolutions */
  getPublishes(
    videoId: string
  ): Promise<Array<{ format: string; resolution: string; isPublished: boolean }> | null>;

  /** Unpublish a specific format/resolution */
  unpublishFormatResolution(videoId: string, format: string, resolution: string): Promise<void>;

  /** Get video watch data for media player */
  getWatchData(videoId: string): Promise<VideoWatchData | null>;

  /** Get video permissions */
  getPermissions(videoId: string): Promise<VideoPermissions | null>;

  /** Get video data with formatted fields */
  getVideoData(videoId: string): Promise<VideoData | null>;

  /** Get all videos data with formatted fields */
  getAllVideosData(): Promise<VideoData[]>;

  /** Get recommended videos (published or live) */
  getRecommendedVideos(): Promise<DrizzleVideo[]>;

  /** Get unique tags from published/live videos */
  getPublishedTags(): Promise<string[]>;

  /** Get unique tags from all videos */
  getAllTags(): Promise<string[]>;

  /** Get video alias URL for indexed videos */
  getAliasUrl(videoId: string): Promise<string | null>;

  /** Batch delete videos with safety filters */
  deleteVideos(
    videoIds: string[],
    force?: boolean
  ): Promise<{ deletedVideoIds: string[]; nonDeletedVideoIds: string[] }>;

  /** Batch finalize videos with safety filters */
  finalizeVideos(
    videoIds: string[],
    force?: boolean
  ): Promise<{ finalizedVideoIds: string[]; nonFinalizedVideoIds: string[] }>;

  /** Write HLS master manifest for adaptive streaming */
  writeMasterManifest(videoId: string, manifestType: string, content: string): Promise<void>;

  /** Mark video index as outdated with Cloudflare cache purge */
  markIndexOutdated(videoId: string): Promise<void>;

  /** Purge Cloudflare cache for video images */
  purgeVideoImageCache(videoId: string): Promise<void>;

  /** Add video to MoarTube index */
  addToIndex(videoId: string, options: AddToIndexOptions): Promise<AddToIndexResult>;

  /** Remove video from MoarTube index */
  removeFromIndex(videoId: string, cloudflareTurnstileToken: string): Promise<void>;

  /** Get node icon as base64 encoded PNG */
  getNodeIconPngBase64(): string;

  /** Get node avatar as base64 encoded PNG */
  getNodeAvatarPngBase64(): string;

  /** Get video preview image as base64 encoded JPG */
  getVideoPreviewJpgBase64(videoId: string): Promise<string>;
}

/**
 * Options for adding a video to the MoarTube index
 */
export interface AddToIndexOptions {
  /** Whether the video contains adult content */
  containsAdultContent: boolean;
  /** User agreed to terms of service */
  termsOfServiceAgreed: boolean;
  /** Cloudflare Turnstile token for validation */
  cloudflareTurnstileToken: string;
}

/**
 * Result of adding a video to the MoarTube index
 */
export interface AddToIndexResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  message?: string | undefined;
  /** Specific error code for 413 (request too large) */
  isRequestTooLarge?: boolean | undefined;
}

// ============================================================================
// Stream Service
// ============================================================================

/**
 * Stream configuration options
 */
export interface StreamConfig {
  isRecordedRemotely?: boolean;
  isRecordedLocally?: boolean;
}

/**
 * Stream service interface
 */
export interface IStreamService {
  /** Start a new live stream */
  startStream(videoId: string, config?: StreamConfig): Promise<void>;

  /** Stop an active live stream */
  stopStream(videoId: string): Promise<void>;

  /** Get all currently streaming videos */
  getActiveStreams(): Promise<DrizzleVideo[]>;

  /** Check if a video is currently streaming */
  isStreaming(videoId: string): Promise<boolean>;
}

// ============================================================================
// Comment Service
// ============================================================================

/**
 * Options for filtering comment queries
 */
export interface GetCommentsOptions extends PaginationOptions {
  /** Filter by video ID */
  videoId?: string;
  /** Search in comment text */
  search?: string;
  /** Get comments before this timestamp */
  beforeTimestamp?: number;
}

/**
 * Input for creating a new comment
 */
export interface CreateCommentInput {
  videoId: string;
  commentPlainText: string;
}

/**
 * Comment service interface
 */
export interface ICommentService {
  /** Get a single comment by ID */
  getComment(videoId: string, commentId: number, timestamp: number): Promise<DrizzleComment | null>;

  /** Get comments with filtering and pagination */
  getComments(options?: GetCommentsOptions): Promise<DrizzleComment[]>;

  /** Get comments for a specific video */
  getCommentsForVideo(
    videoId: string,
    type: string,
    sort: string,
    timestamp: number
  ): Promise<DrizzleComment[]>;

  /** Create a new comment */
  createComment(data: CreateCommentInput): Promise<DrizzleComment>;

  /** Delete a comment */
  deleteComment(videoId: string, commentId: number, timestamp: number): Promise<boolean>;

  /** Delete all comments for a video */
  deleteCommentsForVideo(videoId: string): Promise<number>;

  /** Count comments for a video */
  countCommentsForVideo(videoId: string): Promise<number>;

  /** Count comments newer than timestamp */
  countCommentsNewerThan(timestamp: number): Promise<number>;
}

// ============================================================================
// Auth Service
// ============================================================================

/**
 * Sign-in request data
 */
export interface SignInInput {
  username: string;
  password: string;
  moarTubeNodeHttpProtocol: string;
  moarTubeNodeIp: string;
  moarTubeNodePort: number;
  rememberMe?: boolean;
}

/**
 * Sign-in result
 */
export interface SignInResult {
  isAuthenticated: boolean;
  token?: string;
}

/**
 * Auth service interface
 */
export interface IAuthService {
  /** Sign in with credentials */
  signIn(data: SignInInput): Promise<SignInResult>;

  /** Verify a JWT token */
  verifyToken(token: string): { valid: boolean; username?: string };

  /** Change password */
  changePassword(currentPassword: string, newPassword: string): Promise<boolean>;

  /** Get the JWT secret */
  getJwtSecret(): string;

  /** Validate admin credentials */
  validateCredentials(username: string, password: string): boolean;
}

// ============================================================================
// Storage Service
// ============================================================================

/**
 * Storage mode type
 */
export type StorageMode = 'filesystem' | 's3provider';

/**
 * File metadata
 */
export interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

/**
 * Storage service interface
 */
export interface IStorageService {
  /** Get current storage mode */
  getStorageMode(): StorageMode;

  /** Save a file to storage */
  saveFile(key: string, data: Buffer, contentType?: string): Promise<void>;

  /** Get a file from storage */
  getFile(key: string): Promise<Buffer>;

  /** Get a file stream from storage */
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;

  /** Delete a file from storage */
  deleteFile(key: string): Promise<boolean>;

  /** Check if a file exists */
  fileExists(key: string): Promise<boolean>;

  /** Get file metadata */
  getFileMetadata(key: string): Promise<FileMetadata | null>;

  /** List files in a directory/prefix */
  listFiles(prefix: string): Promise<FileMetadata[]>;

  /** Delete a directory recursively */
  deleteDirectory(prefix: string): Promise<number>;

  /** Copy a file */
  copyFile(sourceKey: string, destKey: string): Promise<void>;

  /** Get presigned URL for direct access (S3 only) */
  getPresignedUrl?(key: string, expiresIn?: number): Promise<string>;
}

// ============================================================================
// Indexer Service
// ============================================================================

/**
 * Indexer service interface for MoarTube Indexer communication
 */
export interface IIndexerService {
  /** Add a video to the index */
  addVideoToIndex(videoId: string): void;

  /** Submit full video data to index */
  submitVideoToIndex(data: VideoIndexData): Promise<IndexerSubmitResult>;

  /** Remove a video from the index */
  removeVideoFromIndex(data: RemoveFromIndexData): Promise<void>;

  /** Update node personalization (name) */
  updateNodeName(name: string): Promise<void>;

  /** Update node personalization (about) */
  updateNodeAbout(about: string): Promise<void>;

  /** Update node personalization (ID) */
  updateNodeId(nodeId: string): Promise<void>;

  /** Update external network configuration */
  updateExternalNetwork(
    publicNodeProtocol: string,
    publicNodeAddress: string,
    publicNodePort: string
  ): Promise<void>;

  /** Perform node identification */
  performNodeIdentification(): Promise<void>;

  /** Check indexer health/connectivity */
  checkHealth(): Promise<boolean>;
}

/**
 * Video index data for submission to indexer
 */
export interface VideoIndexData {
  videoId: string;
  nodeId: string;
  nodeName: string;
  nodeAbout: string;
  publicNodeProtocol: string;
  publicNodeAddress: string;
  publicNodePort: string | number;
  title: string;
  tags: string;
  views: number;
  isLive: boolean;
  isStreaming: boolean;
  lengthSeconds: number;
  creationTimestamp: number;
  containsAdultContent: boolean;
  nodeIconPngBase64: string;
  nodeAvatarPngBase64: string;
  videoPreviewJpgBase64: string;
  moarTubeTokenProof: string;
  cloudflareTurnstileToken: string;
}

/**
 * Data for removing a video from the index
 */
export interface RemoveFromIndexData {
  videoId: string;
  moarTubeTokenProof: string;
  cloudflareTurnstileToken: string;
}

/**
 * Result from indexer submission
 */
export interface IndexerSubmitResult {
  isError: boolean;
  message?: string;
  statusCode?: number;
}

// ============================================================================
// Cloudflare Service
// ============================================================================

/**
 * Cloudflare service interface
 */
export interface ICloudflareService {
  /** Validate Cloudflare Turnstile token */
  validateTurnstileToken(token: string, ip: string): Promise<boolean>;

  /** Purge watch pages cache */
  purgeWatchPages(videoIds?: string[]): Promise<void>;

  /** Purge all watch pages */
  purgeAllWatchPages(): Promise<void>;

  /** Purge embed video pages */
  purgeEmbedVideoPages(videoIds?: string[]): Promise<void>;

  /** Purge all embed video pages */
  purgeAllEmbedVideoPages(): Promise<void>;

  /** Purge node page cache */
  purgeNodePage(): Promise<void>;

  /** Purge node images cache */
  purgeNodeImages(): Promise<void>;

  /** Purge video content (adaptive streams) */
  purgeAdaptiveVideos(videoId: string): Promise<void>;

  /** Purge video content (progressive downloads) */
  purgeProgressiveVideos(videoId: string): Promise<void>;

  /** Purge video preview images */
  purgeVideoPreviewImages(videoIds: string[]): Promise<void>;

  /** Purge video poster images */
  purgeVideoPosterImages(videoIds: string[]): Promise<void>;

  /** Purge video thumbnail images */
  purgeVideoThumbnailImages(videoIds: string[]): Promise<void>;

  /** Purge entire video cache */
  purgeVideo(videoId: string): Promise<void>;

  /** Purge entire cache */
  purgeEntireCache(): Promise<void>;

  /** Purge entire cache with provided credentials (before stored) */
  purgeEntireCacheWithCredentials(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void>;

  /** Set CDN configuration with credentials */
  setCdnConfiguration(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void>;

  /** Reset CDN configuration with credentials */
  resetCdn(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void>;

  /** Add DNS record with credentials */
  addCdnDnsRecord(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string,
    storageConfig: {
      storageMode: 'filesystem' | 's3provider';
      s3Config?:
        | {
            bucketName: string;
            s3ProviderClientConfig: {
              endpoint?: string | undefined;
              region: string;
              forcePathStyle?: boolean;
              credentials?: {
                accessKeyId: string;
                secretAccessKey: string;
              };
            };
          }
        | undefined;
    }
  ): Promise<void>;

  /** Validate Cloudflare credentials */
  validateCredentials(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<boolean>;

  /** Check if Cloudflare is enabled */
  isEnabled(): boolean;
}

// ============================================================================
// WebSocket Service
// ============================================================================

/**
 * WebSocket event names
 */
export type WebSocketEventName =
  | 'echo'
  | 'video_data'
  | 'video_status'
  | 'video_publish'
  | 'chat_message'
  | 'chat_settings'
  | 'information'
  | 'live_stream_stats'
  | 'node_name_update'
  | 'node_about_update'
  | 'node_settings_update';

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
  eventName: WebSocketEventName;
  data?: unknown;
  videoId?: string;
}

/**
 * WebSocket service interface
 */
export interface IWebSocketService {
  /** Broadcast message to all node clients */
  broadcastToNodes(message: WebSocketMessage): void;

  /** Broadcast message to chat clients for a specific video */
  broadcastToChat(videoId: string, message: WebSocketMessage): void;

  /** Broadcast message to all connected clients */
  broadcastToAll(message: WebSocketMessage): void;

  /** Send message to specific client */
  sendToClient(clientId: string, message: WebSocketMessage): void;

  /** Get count of connected clients */
  getConnectedCount(): number;

  /** Get count of chat clients for a video */
  getChatClientCount(videoId: string): number;
}

// ============================================================================
// Report Service
// ============================================================================

/**
 * Report type enum
 */
export type ReportType =
  | 'spam'
  | 'harassment'
  | 'violence'
  | 'copyright'
  | 'inappropriate'
  | 'misinformation'
  | 'other';

/**
 * Input for creating a video report
 */
export interface CreateVideoReportInput {
  videoId: string;
  videoTimestamp: number;
  email: string;
  type: ReportType;
  message: string;
}

/**
 * Input for creating a comment report
 */
export interface CreateCommentReportInput {
  videoId: string;
  commentId: number;
  commentTimestamp: number;
  email: string;
  type: ReportType;
  message: string;
}

/**
 * Report service interface
 */
export interface IReportService {
  /** Create a video report */
  createVideoReport(data: CreateVideoReportInput): Promise<DrizzleVideoReport>;

  /** Create a comment report */
  createCommentReport(data: CreateCommentReportInput): Promise<DrizzleCommentReport>;

  /** Get all video reports */
  getVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReport[]>;

  /** Get all comment reports */
  getCommentReports(options?: PaginationOptions): Promise<DrizzleCommentReport[]>;

  /** Get video reports for a specific video */
  getVideoReportsForVideo(videoId: string): Promise<DrizzleVideoReport[]>;

  /** Get comment reports for a specific video */
  getCommentReportsForVideo(videoId: string): Promise<DrizzleCommentReport[]>;

  /** Archive a video report (mark as handled) */
  archiveVideoReport(reportId: number): Promise<DrizzleVideoReportArchive>;

  /** Archive a comment report (mark as handled) */
  archiveCommentReport(reportId: number): Promise<DrizzleCommentReportArchive>;

  /** Delete a video report */
  deleteVideoReport(reportId: number): Promise<boolean>;

  /** Delete a comment report */
  deleteCommentReport(reportId: number): Promise<boolean>;

  /** Get archived video reports */
  getArchivedVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReportArchive[]>;

  /** Get archived comment reports */
  getArchivedCommentReports(options?: PaginationOptions): Promise<DrizzleCommentReportArchive[]>;

  /** Delete archived video report */
  deleteArchivedVideoReport(archiveId: number): Promise<boolean>;

  /** Delete archived comment report */
  deleteArchivedCommentReport(archiveId: number): Promise<boolean>;

  /** Count total video reports */
  countVideoReports(): Promise<number>;

  /** Count total comment reports */
  countCommentReports(): Promise<number>;

  /** Count video reports newer than timestamp */
  countVideoReportsNewerThan(timestamp: number): Promise<number>;

  /** Count comment reports newer than timestamp */
  countCommentReportsNewerThan(timestamp: number): Promise<number>;
}

// ============================================================================
// Settings Service
// ============================================================================

/**
 * Node settings update input
 */
export interface UpdateNodeSettingsInput {
  nodeName?: string;
  nodeAbout?: string;
  nodeId?: string;
  publicNodeProtocol?: 'http' | 'https';
  publicNodeAddress?: string;
  publicNodePort?: string;
  isSecure?: boolean;
  isReportsEnabled?: boolean;
  isCloudflareTurnstileEnabled?: boolean;
  cloudflareTurnstileSiteKey?: string;
  cloudflareTurnstileSecretKey?: string;
}

/**
 * Database configuration
 */
export interface DatabaseConfigInput {
  dialect: 'sqlite' | 'postgres';
  postgresHost?: string;
  postgresPort?: number;
  postgresDatabase?: string;
  postgresUser?: string;
  postgresPassword?: string;
}

/**
 * Storage configuration
 */
export interface StorageConfigInput {
  storageMode: StorageMode;
  s3BucketName?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region?: string;
}

/**
 * Settings service interface
 */
export interface ISettingsService {
  /** Get all node settings */
  getNodeSettings(): Record<string, unknown>;

  /** Get node version */
  getVersion(): string;

  /** Update node settings */
  updateNodeSettings(data: UpdateNodeSettingsInput): void;

  /** Update node name */
  updateNodeName(name: string): Promise<void>;

  /** Update node about */
  updateNodeAbout(about: string): Promise<void>;

  /** Update node ID */
  updateNodeId(nodeId: string): Promise<void>;

  /** Update account credentials */
  updateCredentials(username: string, password: string): Promise<void>;

  /** Update network settings */
  updateNetworkSettings(protocol: string, address: string, port: string): Promise<void>;

  /** Update database configuration */
  updateDatabaseConfig(config: DatabaseConfigInput): void;

  /** Update storage configuration */
  updateStorageConfig(config: StorageConfigInput): void;

  /** Update Cloudflare configuration */
  updateCloudflareConfig(
    emailAddress: string,
    authenticationKey: string,
    accountId: string,
    zoneId: string,
    zoneName: string
  ): void;

  /** Clear Cloudflare configuration */
  clearCloudflareConfig(): void;

  /** Get avatar image file path */
  getAvatarFilePath(): string | null;

  /** Update avatar and icon */
  updateAvatar(iconFile: string, avatarFile: string): Promise<void>;

  /** Get banner image file path */
  getBannerFilePath(): string | null;

  /** Update banner */
  updateBanner(bannerFile: string): Promise<void>;

  /** Perform node identification */
  performNodeIdentification(): Promise<void>;

  /** Get node identification */
  getNodeIdentification(): Record<string, unknown>;

  /** Check if node is in developer mode */
  isDeveloperMode(): boolean;

  /** Check if running in Docker */
  isDockerEnvironment(): boolean;

  /** Mark all videos as not indexed */
  markAllVideosAsNotIndexed(): Promise<void>;

  /** Get all indexed videos */
  getIndexedVideos(): Promise<DrizzleVideo[]>;

  /** Export all application data */
  exportAllData(): Promise<{
    videos: DrizzleVideo[];
    comments: DrizzleComment[];
    videoReports: DrizzleVideoReport[];
    commentReports: DrizzleCommentReport[];
    videoReportsArchives: DrizzleVideoReportArchive[];
    commentReportsArchives: DrizzleCommentReportArchive[];
    liveChatMessages: DrizzleLiveChatMessage[];
    cryptoWalletAddresses: DrizzleCryptoWalletAddress[];
    links: DrizzleLink[];
  }>;

  /** Delete all application data */
  deleteAllData(): Promise<void>;

  /** Import database from JSON file */
  importDatabase(databaseFileContent: string): Promise<void>;
}

// ============================================================================
// Live Chat Service
// ============================================================================

/**
 * Input for creating a chat message
 */
export interface CreateChatMessageInput {
  videoId: string;
  username: string;
  usernameColorHexCode: string;
  chatMessage: string;
}

/**
 * Live chat service interface
 */
export interface ILiveChatService {
  /** Get recent chat messages for a video */
  getRecentMessages(videoId: string, count?: number): Promise<DrizzleLiveChatMessage[]>;

  /** Get messages after a timestamp */
  getMessagesAfter(
    videoId: string,
    afterTimestamp: number,
    limit?: number
  ): Promise<DrizzleLiveChatMessage[]>;

  /** Create a new chat message */
  createMessage(data: CreateChatMessageInput): Promise<DrizzleLiveChatMessage>;

  /** Delete a chat message */
  deleteMessage(messageId: number): Promise<boolean>;

  /** Delete all messages for a video */
  deleteMessagesForVideo(videoId: string): Promise<number>;

  /** Prune old messages (keep last N) */
  pruneOldMessages(videoId: string, keepCount: number): Promise<number>;

  /** Count messages for a video */
  countMessagesForVideo(videoId: string): Promise<number>;
}

// ============================================================================
// Link Service
// ============================================================================

/**
 * Input for creating a social link
 */
export interface CreateLinkInput {
  url: string;
  svgGraphic: string;
}

/**
 * Link service interface
 */
export interface ILinkService {
  /** Get all links */
  getLinks(): Promise<DrizzleLink[]>;

  /** Get a link by ID */
  getLink(linkId: number): Promise<DrizzleLink | null>;

  /** Create a new link */
  createLink(data: CreateLinkInput): Promise<DrizzleLink>;

  /** Update a link */
  updateLink(linkId: number, data: Partial<CreateLinkInput>): Promise<DrizzleLink | null>;

  /** Delete a link */
  deleteLink(linkId: number): Promise<boolean>;

  /** Count total links */
  countLinks(): Promise<number>;
}

// ============================================================================
// Monetization Service
// ============================================================================

/**
 * Input for creating a crypto wallet address
 */
export interface CreateWalletAddressInput {
  walletAddress: string;
  chain: string;
  chainId: string;
  currency: string;
}

/**
 * Monetization service interface
 */
export interface IMonetizationService {
  /** Get all wallet addresses */
  getWalletAddresses(): Promise<DrizzleCryptoWalletAddress[]>;

  /** Get a wallet address by ID */
  getWalletAddress(walletAddressId: number): Promise<DrizzleCryptoWalletAddress | null>;

  /** Get wallet addresses by chain */
  getWalletAddressesByChain(chain: string): Promise<DrizzleCryptoWalletAddress[]>;

  /** Create a new wallet address */
  createWalletAddress(data: CreateWalletAddressInput): Promise<DrizzleCryptoWalletAddress>;

  /** Update a wallet address */
  updateWalletAddress(
    walletAddressId: number,
    data: Partial<CreateWalletAddressInput>
  ): Promise<DrizzleCryptoWalletAddress | null>;

  /** Delete a wallet address */
  deleteWalletAddress(walletAddressId: number): Promise<boolean>;

  /** Count total wallet addresses */
  countWalletAddresses(): Promise<number>;
}

/**
 * Links Service Interface
 */
export interface ILinksService {
  /** Get all links */
  getAllLinks(): Promise<DrizzleLink[]>;

  /** Create a new link */
  createLink(data: CreateLinkInput): Promise<DrizzleLink>;

  /** Delete a link */
  deleteLink(linkId: number): Promise<boolean>;
}

/**
 * Create Link Input
 */
export interface CreateLinkInput {
  url: string;
  svgGraphic: string;
}
