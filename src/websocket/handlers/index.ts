/**
 * WebSocket Handlers Module
 *
 * Barrel export for all WebSocket message handlers.
 */

export { WebSocketHandler, type HandlerContext } from '@websocket/handlers/base.js';
export { ChatJoinHandler } from '@websocket/handlers/chat-join.js';
export { ChatMessageHandler } from '@websocket/handlers/chat-message.js';
export { VideoStatusHandler } from '@websocket/handlers/video-status.js';
export { EchoHandler } from '@websocket/handlers/echo.js';
export { RegisterHandler } from '@websocket/handlers/register.js';
