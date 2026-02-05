/**
 * WebSocket Handlers Module
 *
 * Barrel export for all WebSocket message handlers.
 */

// Base handler
export { WebSocketHandler, type HandlerContext } from '@websocket/handlers/base.js';

// Specific handlers
export { ChatJoinHandler } from '@websocket/handlers/chat-join.js';
export { ChatMessageHandler } from '@websocket/handlers/chat-message.js';
export { EchoHandler } from '@websocket/handlers/echo.js';
export { PingHandler } from '@websocket/handlers/ping.js';
export { RegisterHandler } from '@websocket/handlers/register.js';
export { VideoStatusHandler } from '@websocket/handlers/video-status.js';
