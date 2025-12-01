/**
 * WebSocket message type definitions
 * These types will be fully implemented in Phase 1
 */

export type WebSocketEventName =
  | 'live_stream_stats'
  | 'chat_message'
  | 'video_status'
  | 'node_name_update';

export interface WebSocketMessage {
  eventName: WebSocketEventName;
  videoId?: string;
  [key: string]: unknown;
}
