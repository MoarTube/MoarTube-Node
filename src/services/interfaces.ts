/**
 * Service Layer Interfaces
 *
 * This file defines the contracts for all service classes in the application.
 * Services encapsulate business logic and coordinate between repositories,
 * external APIs, and other services.
 */

// ============================================================================
// Video Service
// ============================================================================

/**
 * Options for filtering video queries
 */
export interface GetVideosOptions {
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
  /** Pagination options */
  limit?: number;
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
// ============================================================================
// Comment Service
// ============================================================================

/**
 * Input for creating a new comment
 */
export interface CreateCommentInput {
  videoId: string;
  commentPlainText: string;
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

// ============================================================================
// Indexer Service
// ============================================================================

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
  | 'cloudflare_turnstile_information'
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
  databaseConfig: {
    databaseDialect: 'sqlite' | 'postgres';
    postgresConfig?: {
      databaseName: string;
      username: string;
      password: string;
      host: string;
      port: number;
    };
  };
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

// ============================================================================
// Account Service
// ============================================================================

export interface JwtPayload {
  username: string;
}

export interface SignInInput {
  username: string;
  password: string;
  moarTubeNodeHttpProtocol: string;
  moarTubeNodeIp: string;
  moarTubeNodePort: number;
  rememberMe: boolean;
}

export interface SignInResult {
  isAuthenticated: boolean;
  token?: string;
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
 * Create Link Input
 */
export interface CreateLinkInput {
  url: string;
  svgGraphic: string;
}
