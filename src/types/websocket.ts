/**
 * WebSocket message type definitions
 * Complete type definitions for WebSocket communication in MoarTube-Node
 */

import type { WebSocket } from 'ws';
import type { VideoDataPayload } from './api.js';

// ============================================
// WebSocket Event Names
// ============================================

/**
 * All possible WebSocket event names
 */
export type WebSocketEventName =
  // Live streaming events
  | 'live_stream_stats'
  | 'live_stream_started'
  | 'live_stream_stopped'
  // Chat events
  | 'chat_message'
  | 'chat_history'
  // Video events
  | 'video_status'
  | 'video_data'
  | 'video_importing'
  | 'video_imported'
  | 'video_publishing'
  | 'video_published'
  | 'video_error'
  | 'video_finalized'
  // Node events
  | 'node_name_update'
  | 'node_about_update'
  // Echo event (generic broadcast)
  | 'echo';

// ============================================
// WebSocket Client Types
// ============================================

/**
 * Type of WebSocket client connection
 */
export type WebSocketClientType = 'node_peer' | 'admin' | 'viewer';

/**
 * Extended WebSocket with additional properties for MoarTube
 */
export interface ExtendedWebSocket extends WebSocket {
  /** Type of client connection */
  socketType: WebSocketClientType;
  /** Video ID the client is watching (for live streams) */
  videoId?: string;
  /** Whether the client is authenticated */
  isAuthenticated?: boolean;
  /** Client identifier */
  clientId?: string;
  /** Last activity timestamp */
  lastActivity?: number;
}

// ============================================
// WebSocket Message Types
// ============================================

/**
 * Base WebSocket message structure
 */
export interface WebSocketMessageBase {
  eventName: WebSocketEventName;
}

/**
 * Live stream stats message
 */
export interface LiveStreamStatsMessage extends WebSocketMessageBase {
  eventName: 'live_stream_stats';
  watchingCount: number;
}

/**
 * Chat message
 */
export interface ChatMessage extends WebSocketMessageBase {
  eventName: 'chat_message';
  videoId: string;
  username: string;
  usernameColorHexCode: string;
  chatMessage: string;
  timestamp: number;
}

/**
 * Chat history message
 */
export interface ChatHistoryMessage extends WebSocketMessageBase {
  eventName: 'chat_history';
  videoId: string;
  messages: Array<{
    username: string;
    usernameColorHexCode: string;
    chatMessage: string;
    timestamp: number;
  }>;
}

/**
 * Video status update message
 */
export interface VideoStatusMessage extends WebSocketMessageBase {
  eventName: 'video_status';
  videoId: string;
  status:
    | 'importing'
    | 'imported'
    | 'publishing'
    | 'published'
    | 'streaming'
    | 'stopped'
    | 'error'
    | 'finalized';
}

/**
 * Video data message (full video info)
 */
export interface VideoDataMessage extends WebSocketMessageBase {
  eventName: 'video_data';
  payload: VideoDataPayload;
}

/**
 * Echo message (generic broadcast wrapper)
 */
export interface EchoMessage extends WebSocketMessageBase {
  eventName: 'echo';
  data: {
    eventName: string;
    payload: unknown;
  };
}

/**
 * Node name update message
 */
export interface NodeNameUpdateMessage extends WebSocketMessageBase {
  eventName: 'node_name_update';
  nodeName: string;
}

/**
 * Live stream started message
 */
export interface LiveStreamStartedMessage extends WebSocketMessageBase {
  eventName: 'live_stream_started';
  videoId: string;
}

/**
 * Live stream stopped message
 */
export interface LiveStreamStoppedMessage extends WebSocketMessageBase {
  eventName: 'live_stream_stopped';
  videoId: string;
}

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage =
  | LiveStreamStatsMessage
  | ChatMessage
  | ChatHistoryMessage
  | VideoStatusMessage
  | VideoDataMessage
  | EchoMessage
  | NodeNameUpdateMessage
  | LiveStreamStartedMessage
  | LiveStreamStoppedMessage
  | WebSocketMessageBase;

// ============================================
// WebSocket Handler Types
// ============================================

/**
 * Incoming WebSocket message from client
 */
export interface IncomingWebSocketMessage {
  eventName: string;
  videoId?: string;
  [key: string]: unknown;
}

/**
 * WebSocket broadcast options
 */
export interface BroadcastOptions {
  /** Only send to clients watching this video */
  videoId?: string;
  /** Only send to specific client types */
  clientTypes?: WebSocketClientType[];
  /** Exclude these client IDs */
  excludeClients?: string[];
}

/**
 * Live stream watching counts per video
 */
export interface LiveStreamWatchingCounts {
  [videoId: string]: number;
}

/**
 * Live stream watching counts tracker per worker
 */
export interface LiveStreamWatchingCountsTracker {
  [workerId: number]: LiveStreamWatchingCounts;
}
