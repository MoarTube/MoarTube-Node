/**
 * WebSocket Service
 *
 * Service layer for WebSocket message broadcasting and client management.
 * Provides abstraction over the cluster-aware WebSocket system.
 */
import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { WebSocketMessage, WebSocketEventName } from '@services/interfaces.js';

/**
 * WebSocketService class
 *
 * Handles WebSocket message broadcasting through the cluster process system.
 * Messages are sent to the master process which distributes them to workers.
 */
export class WebSocketService extends BaseService {
  // Track client counts (in actual implementation these would be managed by master process)
  private readonly nodeClientCount: number = 0;
  private readonly chatClientCounts: Map<string, number> = new Map();

  constructor(logger: Logger) {
    super('WebSocketService', logger);
  }

  /**
   * Broadcast message to all node clients
   */
  broadcastToNodes(message: WebSocketMessage): void {
    this.sendToMaster({
      cmd: 'websocket_broadcast',
      message,
    });
  }

  /**
   * Broadcast message to chat clients for a specific video
   */
  broadcastToChat(videoId: string, message: WebSocketMessage): void {
    this.sendToMaster({
      cmd: 'websocket_broadcast_chat',
      videoId,
      message,
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(message: WebSocketMessage): void {
    // Broadcast to both node clients and all chat rooms
    this.broadcastToNodes(message);

    // Would iterate through all video IDs with active chats
    // For now, just log the intent
    this.logger.debug('Broadcasting to all clients', { eventName: message.eventName });
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: WebSocketMessage): void {
    this.sendToMaster({
      cmd: 'websocket_send_to_client',
      clientId,
      message,
    });
  }

  /**
   * Get count of connected node clients
   */
  getConnectedCount(): number {
    // In real implementation, would query master process
    return this.nodeClientCount;
  }

  /**
   * Get count of chat clients for a video
   */
  getChatClientCount(videoId: string): number {
    // In real implementation, would query master process
    return this.chatClientCounts.get(videoId) ?? 0;
  }

  /**
   * Broadcast video data update
   */
  broadcastVideoData(videoId: string, data: Record<string, unknown>): void {
    this.broadcastToNodes({
      eventName: 'video_data',
      videoId,
      data,
    });
  }

  /**
   * Broadcast video status update
   */
  broadcastVideoStatus(videoId: string, status: Record<string, unknown>): void {
    this.broadcastToNodes({
      eventName: 'video_status',
      videoId,
      data: status,
    });
  }

  /**
   * Broadcast video publish event
   */
  broadcastVideoPublish(videoId: string, data: Record<string, unknown>): void {
    this.broadcastToNodes({
      eventName: 'video_publish',
      videoId,
      data,
    });
  }

  /**
   * Broadcast chat message to video's chat room
   */
  broadcastChatMessage(
    videoId: string,
    username: string,
    usernameColorHexCode: string,
    chatMessage: string,
    timestamp: number
  ): void {
    this.broadcastToChat(videoId, {
      eventName: 'chat_message',
      videoId,
      data: {
        username,
        usernameColorHexCode,
        chatMessage,
        timestamp,
      },
    });
  }

  /**
   * Broadcast live stream stats
   */
  broadcastLiveStreamStats(videoId: string, stats: Record<string, unknown>): void {
    this.broadcastToNodes({
      eventName: 'live_stream_stats',
      videoId,
      data: stats,
    });
  }

  /**
   * Broadcast node name update
   */
  broadcastNodeNameUpdate(nodeName: string): void {
    this.broadcastToNodes({
      eventName: 'node_name_update',
      data: { nodeName },
    });
  }

  /**
   * Broadcast node about update
   */
  broadcastNodeAboutUpdate(nodeAbout: string): void {
    this.broadcastToNodes({
      eventName: 'node_about_update',
      data: { nodeAbout },
    });
  }

  /**
   * Broadcast node settings update
   */
  broadcastNodeSettingsUpdate(settings: Record<string, unknown>): void {
    this.broadcastToNodes({
      eventName: 'node_settings_update',
      data: settings,
    });
  }

  /**
   * Send echo message (wrapper event for client processing)
   */
  echo(eventName: WebSocketEventName, payload: unknown): void {
    this.broadcastToNodes({
      eventName: 'echo',
      data: {
        eventName,
        payload,
      },
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Send message to master process via IPC
   */
  private sendToMaster(message: Record<string, unknown>): void {
    // In cluster mode, process.send sends to master
    // In non-cluster mode, this is a no-op
    if (typeof process.send === 'function') {
      process.send(message);
    } else {
      // Not in cluster mode - log for debugging
      this.logger.debug('WebSocket broadcast (non-cluster mode)', {
        cmd: message['cmd'],
      });
    }
  }
}
