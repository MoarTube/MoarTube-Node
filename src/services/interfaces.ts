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
} from '../database/schema';
import type { PaginationOptions, PaginatedResult } from '../types/models';

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
 * Video service interface
 */
export interface IVideoService {
  /** Get a single video by ID */
  getVideo(videoId: string): Promise<DrizzleVideo | null>;

  /** Get videos with filtering and pagination */
  getVideos(options?: GetVideosOptions): Promise<PaginatedResult<DrizzleVideo>>;

  /** Create a new video (import) */
  createVideo(data: CreateVideoInput): Promise<{ videoId: string }>;

  /** Update video metadata */
  updateVideo(videoId: string, data: UpdateVideoInput): Promise<DrizzleVideo | null>;

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

  /** Mark video index as outdated */
  setIndexOutdated(videoId: string): Promise<void>;
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

  /** Set stream as live */
  setLive(videoId: string, isLive: boolean): Promise<void>;

  /** Get all currently streaming videos */
  getActiveStreams(): Promise<DrizzleVideo[]>;

  /** Check if a video is currently streaming */
  isStreaming(videoId: string): Promise<boolean>;

  /** Mark stream as streamed (completed) */
  setStreamed(videoId: string): Promise<void>;
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
  commentText: string;
}

/**
 * Comment service interface
 */
export interface ICommentService {
  /** Get a single comment by ID */
  getComment(commentId: number): Promise<DrizzleComment | null>;

  /** Get comments with filtering and pagination */
  getComments(options?: GetCommentsOptions): Promise<DrizzleComment[]>;

  /** Get comments for a specific video */
  getCommentsForVideo(videoId: string, options?: PaginationOptions): Promise<DrizzleComment[]>;

  /** Create a new comment */
  createComment(data: CreateCommentInput): Promise<DrizzleComment>;

  /** Delete a comment */
  deleteComment(commentId: number): Promise<boolean>;

  /** Delete all comments for a video */
  deleteCommentsForVideo(videoId: string): Promise<number>;

  /** Count comments for a video */
  countCommentsForVideo(videoId: string): Promise<number>;
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

  /** Remove a video from the index */
  removeVideoFromIndex(videoId: string): Promise<void>;

  /** Update node personalization (name) */
  updateNodeName(name: string): Promise<void>;

  /** Update node personalization (about) */
  updateNodeAbout(about: string): Promise<void>;

  /** Update node personalization (ID) */
  updateNodeId(nodeId: string): Promise<void>;

  /** Update external network configuration */
  updateExternalNetwork(): Promise<void>;

  /** Perform node identification */
  performNodeIdentification(): Promise<void>;

  /** Check indexer health/connectivity */
  checkHealth(): Promise<boolean>;
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
  purgeVideoPreviewImages(videoId: string): Promise<void>;

  /** Purge video poster images */
  purgePosterImages(videoId: string): Promise<void>;

  /** Purge video thumbnail images */
  purgeThumbnailImages(videoId: string): Promise<void>;

  /** Purge entire video cache */
  purgeVideo(videoId: string): Promise<void>;

  /** Purge entire cache */
  purgeEntireCache(): Promise<void>;

  /** Set CDN configuration */
  setCdnConfiguration(): void;

  /** Reset CDN configuration */
  resetCdn(): void;

  /** Add DNS record */
  addDnsRecord(): void;

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
export type ReportType = 'spam' | 'harassment' | 'violence' | 'copyright' | 'other';

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
  commentId: string;
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

  /** Get avatar image stream */
  getAvatar(): NodeJS.ReadableStream | null;

  /** Update avatar and icon */
  updateAvatar(iconFile: string, avatarFile: string): Promise<void>;

  /** Get banner image stream */
  getBanner(): NodeJS.ReadableStream | null;

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
