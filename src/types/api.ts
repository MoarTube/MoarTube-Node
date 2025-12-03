/**
 * API request/response type definitions
 * Complete type definitions for all API endpoints in MoarTube-Node
 */

import type { Video, Comment } from './models.js';
import type { NodeSettings } from './config.js';

// ============================================
// Base Response Types
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  isError: boolean;
  message?: string;
  data?: T;
}

/**
 * Paginated response with total count
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  totalCount: number;
  page: number;
  limit: number;
}

/**
 * Error response
 */
export interface ApiErrorResponse {
  isError: true;
  message: string;
}

/**
 * Success response with data
 */
export interface ApiSuccessResponse<T = unknown> {
  isError: false;
  data?: T;
}

// ============================================
// Authentication Request/Response Types
// ============================================

/**
 * Sign in request body
 */
export interface SignInRequest {
  username: string;
  password: string;
  moarTubeNodeHttpProtocol: 'http' | 'https';
  moarTubeNodeIp: string;
  moarTubeNodePort: string | number;
  rememberMe: boolean;
}

/**
 * Sign in response
 */
export interface SignInResponse {
  isError: boolean;
  isAuthenticated: boolean;
  token?: string;
}

// ============================================
// Video Request/Response Types
// ============================================

/**
 * Video import request
 */
export interface VideoImportRequest {
  title: string;
  description: string;
  tags: string;
}

/**
 * Video import response
 */
export interface VideoImportResponse {
  isError: boolean;
  videoId?: string;
}

/**
 * Video search/list request parameters
 */
export interface VideoSearchParams {
  searchTerm?: string;
  sortTerm?: 'latest' | 'popular' | 'oldest';
  tagTerm?: string;
  tagLimit?: number;
  timestamp?: number;
  limit?: number;
  type?: 'all' | 'published' | 'unpublished' | 'streaming' | 'importing';
}

/**
 * Video update request
 */
export interface VideoUpdateRequest {
  title?: string;
  description?: string;
  tags?: string;
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
 * Video data response (for WebSocket broadcasts)
 */
export interface VideoDataPayload {
  videoId: string;
  thumbnail: string;
  title: string;
  description: string;
  tags: string;
  lengthSeconds: number;
  lengthTimestamp: string;
  views: number;
  comments: number;
  likes: number;
  dislikes: number;
  bandwidth: number;
  isImporting: number;
  isImported: number;
  isPublishing: number;
  isPublished: number;
  isLive: number;
  isStreaming: number;
  isStreamed: number;
  isStreamRecordedRemotely: number;
  isStreamRecordedLocally: number;
  isIndexed: number;
  isIndexing: number;
  isIndexOutdated: number;
  isError: number;
  isFinalized: number;
  meta: string;
  creationTimestamp: number;
}

/**
 * Video permission update request
 */
export interface VideoPermissionRequest {
  videoId: string;
  type: 'comments' | 'likes' | 'dislikes' | 'reports' | 'liveChat';
  isEnabled: boolean;
}

// ============================================
// Comment Request/Response Types
// ============================================

/**
 * Add comment request
 */
export interface AddCommentRequest {
  videoId: string;
  commentPlainText: string;
  cloudflareTurnstileToken?: string;
}

/**
 * Get comments request parameters
 */
export interface GetCommentsParams {
  videoId: string;
  type: 'before' | 'after';
  timestamp: number;
  sort: 'ascending' | 'descending';
  limit?: number;
}

/**
 * Delete comment request
 */
export interface DeleteCommentRequest {
  videoId: string;
  commentId: number;
}

// ============================================
// Report Request/Response Types
// ============================================

/**
 * Submit video report request
 */
export interface SubmitVideoReportRequest {
  videoId: string;
  email: string;
  reportType: string;
  message: string;
  cloudflareTurnstileToken?: string;
}

/**
 * Submit comment report request
 */
export interface SubmitCommentReportRequest {
  videoId: string;
  commentId: string;
  email: string;
  reportType: string;
  message: string;
  cloudflareTurnstileToken?: string;
}

/**
 * Get reports request parameters
 */
export interface GetReportsParams {
  type: 'video' | 'comment';
  sort: 'ascending' | 'descending';
  limit?: number;
}

/**
 * Archive report request
 */
export interface ArchiveReportRequest {
  reportId: number;
}

// ============================================
// Stream Request/Response Types
// ============================================

/**
 * Start stream request
 */
export interface StartStreamRequest {
  title: string;
  description: string;
  tags: string;
  rtmpUrl?: string;
  isRecordingLocally?: boolean;
  isRecordingRemotely?: boolean;
}

/**
 * Stream response with stream key
 */
export interface StartStreamResponse {
  isError: boolean;
  videoId?: string;
  streamKey?: string;
}

/**
 * Stream status response
 */
export interface StreamStatusResponse {
  isError: boolean;
  isStreaming: boolean;
  viewerCount?: number;
}

// ============================================
// Settings Request/Response Types
// ============================================

/**
 * Update node settings request (partial)
 */
export type UpdateNodeSettingsRequest = Partial<NodeSettings>;

/**
 * Update account credentials request
 */
export interface UpdateCredentialsRequest {
  username: string;
  password: string;
}

/**
 * Network settings update request
 */
export interface UpdateNetworkSettingsRequest {
  nodeListeningPort: number | string;
  isSecure: boolean;
  publicNodeProtocol: 'http' | 'https';
  publicNodeAddress: string;
  publicNodePort: number | string;
}

// ============================================
// Monetization Request/Response Types
// ============================================

/**
 * Add crypto wallet request
 */
export interface AddCryptoWalletRequest {
  walletAddress: string;
  chain: string;
  chainId: string;
  currency: string;
}

/**
 * Remove crypto wallet request
 */
export interface RemoveCryptoWalletRequest {
  walletAddressId: number;
}

// ============================================
// Link Request/Response Types
// ============================================

/**
 * Add link request
 */
export interface AddLinkRequest {
  url: string;
  svgGraphic: string;
}

/**
 * Remove link request
 */
export interface RemoveLinkRequest {
  linkId: number;
}

// ============================================
// Node Request/Response Types
// ============================================

/**
 * Node information response
 */
export interface NodeInfoResponse {
  isError: boolean;
  nodeName?: string;
  nodeAbout?: string;
  nodeId?: string;
  publicNodeProtocol?: string;
  publicNodeAddress?: string;
  publicNodePort?: string | number;
  isCloudflareTurnstileEnabled?: boolean;
  cloudflareTurnstileSiteKey?: string;
}

/**
 * Node avatar/icon/banner upload response
 */
export interface ImageUploadResponse {
  isError: boolean;
  message?: string;
}

// ============================================
// Status Request/Response Types
// ============================================

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime?: number;
}

/**
 * Detailed health check response
 */
export interface DetailedHealthCheckResponse extends HealthCheckResponse {
  checks: {
    database: { status: 'ok' | 'error'; latency?: number };
    storage: { status: 'ok' | 'error'; mode?: string };
  };
}

// ============================================
// External Resources Types
// ============================================

/**
 * External video resource request
 */
export interface ExternalVideoResourceParams {
  videoId: string;
  format: 'm3u8' | 'mp4' | 'webm' | 'ogv';
  resolution?: string;
}

/**
 * External image resource request
 */
export interface ExternalImageResourceParams {
  videoId: string;
  type: 'thumbnail' | 'preview' | 'poster';
}

// ============================================
// Watch Page Types
// ============================================

/**
 * Watch page data
 */
export interface WatchPageData {
  video: Video;
  comments: Comment[];
  nodeSettings: Partial<NodeSettings>;
  externalVideosBaseUrl: string;
  externalResourcesBaseUrl: string;
}

/**
 * Embed page data
 */
export interface EmbedPageData {
  video: Video;
  externalVideosBaseUrl: string;
}

// ============================================
// Indexer Communication Types
// ============================================

/**
 * Index update request data
 */
export interface IndexUpdateData {
  videoId: string;
  title: string;
  tags: string;
  views: number;
  isStreaming: boolean;
  lengthSeconds: number;
  nodeIconPngBase64: string;
  nodeAvatarPngBase64: string;
  videoPreviewJpgBase64: string;
  moarTubeTokenProof: string;
}

/**
 * Index update response
 */
export interface IndexUpdateResponse {
  isError: boolean;
  message?: string;
}
