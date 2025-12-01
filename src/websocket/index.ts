/**
 * WebSocket Module
 *
 * Barrel export for WebSocket functionality including
 * the manager and all message handlers.
 */

// WebSocket Manager
export {
  WebSocketManager,
  type WebSocketManagerOptions,
  type WebSocketLogger,
} from './websocket-manager';

// Handlers
export {
  WebSocketHandler,
  type HandlerContext,
  ChatMessageHandler,
  LiveStreamHandler,
  VideoStatusHandler,
  EchoHandler,
} from './handlers';
