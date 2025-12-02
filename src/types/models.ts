/**
 * Database model type definitions
 * Complete type definitions for all database tables used in MoarTube-Node
 */

// ============================================
// Video Model
// ============================================

/**
 * Video output formats for adaptive and progressive streaming
 */
export interface VideoOutputs {
  m3u8: string[];
  mp4: string[];
  webm: string[];
  ogv: string[];
}

/**
 * Video metadata (extensible JSON field)
 */
export interface VideoMeta {
  [key: string]: unknown;
}

/**
 * Complete video record from the videos table
 */
export interface Video {
  id: number;
  video_id: string;
  source_file_extension: string;
  title: string;
  description: string;
  tags: string;
  length_seconds: number;
  length_timestamp: string;
  views: number;
  comments: number;
  likes: number;
  dislikes: number;
  bandwidth: number;
  is_importing: boolean;
  is_imported: boolean;
  is_publishing: boolean;
  is_published: boolean;
  is_streaming: boolean;
  is_streamed: boolean;
  is_stream_recorded_remotely: boolean;
  is_stream_recorded_locally: boolean;
  is_live: boolean;
  is_indexing: boolean;
  is_indexed: boolean;
  is_index_outdated: boolean;
  is_error: boolean;
  is_finalized: boolean;
  is_hidden: boolean;
  is_passworded: boolean;
  password: string;
  is_comments_enabled: boolean;
  is_likes_enabled: boolean;
  is_dislikes_enabled: boolean;
  is_reports_enabled: boolean;
  is_live_chat_enabled: boolean;
  outputs: string; // JSON string of VideoOutputs
  meta: string; // JSON string of VideoMeta
  creation_timestamp: number;
}

/**
 * Video data for insertion (without auto-generated fields)
 */
export type NewVideo = Omit<Video, 'id'>;

/**
 * Parsed video with typed outputs and meta
 */
export interface VideoParsed extends Omit<Video, 'outputs' | 'meta'> {
  outputs: VideoOutputs;
  meta: VideoMeta;
}

// ============================================
// Comment Model
// ============================================

/**
 * Complete comment record from the comments table
 */
export interface Comment {
  id: number;
  video_id: string;
  comment_plain_text_sanitized: string;
  timestamp: number;
}

/**
 * Comment data for insertion
 */
export type NewComment = Omit<Comment, 'id'>;

// ============================================
// Video Report Model
// ============================================

/**
 * Report type categories
 */
export type ReportType =
  | 'spam'
  | 'harassment'
  | 'copyright'
  | 'inappropriate'
  | 'violence'
  | 'misinformation'
  | 'other';

/**
 * Complete video report record from the videoreports table
 */
export interface VideoReport {
  report_id: number;
  timestamp: number;
  video_timestamp: number;
  video_id: string;
  email: string;
  type: string;
  message: string;
}

/**
 * Video report data for insertion
 */
export type NewVideoReport = Omit<VideoReport, 'report_id'>;

// ============================================
// Comment Report Model
// ============================================

/**
 * Complete comment report record from the commentreports table
 */
export interface CommentReport {
  report_id: number;
  timestamp: number;
  comment_timestamp: number;
  video_id: string;
  comment_id: string;
  email: string;
  type: string;
  message: string;
}

/**
 * Comment report data for insertion
 */
export type NewCommentReport = Omit<CommentReport, 'report_id'>;

// ============================================
// Video Reports Archive Model
// ============================================

/**
 * Archived video report record from the videoreportsarchives table
 */
export interface VideoReportArchive {
  archive_id: number;
  report_id: number;
  timestamp: number;
  video_timestamp: number;
  video_id: string;
  email: string;
  type: string;
  message: string;
}

/**
 * Video report archive data for insertion
 */
export type NewVideoReportArchive = Omit<VideoReportArchive, 'archive_id'>;

// ============================================
// Comment Reports Archive Model
// ============================================

/**
 * Archived comment report record from the commentreportsarchives table
 */
export interface CommentReportArchive {
  archive_id: number;
  report_id: number;
  timestamp: number;
  comment_timestamp: number;
  video_id: string;
  comment_id: string;
  email: string;
  type: string;
  message: string;
}

/**
 * Comment report archive data for insertion
 */
export type NewCommentReportArchive = Omit<CommentReportArchive, 'archive_id'>;

// ============================================
// Live Chat Message Model
// ============================================

/**
 * Complete live chat message record from the livechatmessages table
 */
export interface LiveChatMessage {
  chat_message_id: number;
  video_id: string;
  username: string;
  username_color_hex_code: string;
  chat_message: string;
  timestamp: number;
}

/**
 * Live chat message data for insertion
 */
export type NewLiveChatMessage = Omit<LiveChatMessage, 'chat_message_id'>;

// ============================================
// Crypto Wallet Address Model
// ============================================

/**
 * Complete crypto wallet address record from the cryptowalletaddresses table
 */
export interface CryptoWalletAddress {
  wallet_address_id: number;
  wallet_address: string;
  chain: string;
  chain_id: string;
  currency: string;
  timestamp: number;
}

/**
 * Crypto wallet address data for insertion
 */
export type NewCryptoWalletAddress = Omit<CryptoWalletAddress, 'wallet_address_id'>;

// ============================================
// Link Model
// ============================================

/**
 * Complete link record from the links table (social links)
 */
export interface Link {
  link_id: number;
  url: string;
  svg_graphic: string;
  timestamp: number;
}

/**
 * Link data for insertion
 */
export type NewLink = Omit<Link, 'link_id'>;

// ============================================
// Query Result Types
// ============================================

/**
 * Generic pagination options for database queries
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Sort options for database queries
 */
export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Combined query options
 */
export interface QueryOptions extends PaginationOptions {
  sort?: SortOptions;
}

/**
 * Paginated result wrapper for list queries
 */
export interface PaginatedResult<T> {
  /** Array of result items */
  data: T[];
  /** Total count of matching items (before pagination) */
  total: number;
  /** Number of items in current page */
  count: number;
  /** Current offset */
  offset: number;
  /** Current limit */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}
