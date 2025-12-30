/**
 * WebSocket Module
 *
 * Barrel export for WebSocket functionality including
 * the manager and all message handlers.
 */

// WebSocket Manager
export { WebSocketManager, type WebSocketManagerOptions } from '@websocket/websocket-manager.js';

// Handlers
export {
  WebSocketHandler,
  type HandlerContext,
  ChatMessageHandler,
  VideoStatusHandler,
  EchoHandler,
} from '@websocket/handlers/index.js';
