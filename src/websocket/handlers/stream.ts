/**
 * Live Stream Handler
 *
 * Handles live stream related WebSocket events including
 * stream status updates and viewer tracking.
 */

import type {
  ExtendedWebSocket,
  IncomingWebSocketMessage,
  LiveStreamStatsMessage,
  LiveStreamStartedMessage,
  LiveStreamStoppedMessage,
} from '../../types/websocket';
import { type HandlerContext, WebSocketHandler } from './base';

/**
 * Handler for live stream events
 */
export class LiveStreamHandler extends WebSocketHandler {
  readonly name = 'LiveStreamHandler';

  /**
   * Event names this handler responds to
   */
  private readonly handledEvents = new Set([
    'live_stream_started',
    'live_stream_stopped',
    'join_stream',
    'leave_stream',
  ]);

  /**
   * Check if this is a live stream event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return this.handledEvents.has(message.eventName);
  }

  /**
   * Handle live stream events
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    switch (message.eventName) {
      case 'join_stream':
        this.handleJoinStream(client, message, context);
        break;

      case 'leave_stream':
        this.handleLeaveStream(client, context);
        break;

      case 'live_stream_started':
        this.handleStreamStarted(client, message, context);
        break;

      case 'live_stream_stopped':
        this.handleStreamStopped(client, message, context);
        break;
    }
  }

  /**
   * Handle client joining a stream
   */
  private handleJoinStream(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    const { videoId } = message;

    if (videoId === undefined || videoId === '') {
      context.log.warn('Join stream without videoId', { clientId: client.clientId });
      return;
    }

    // Update client metadata
    client.videoId = videoId;
    client.socketType = 'node_peer';
    client.lastActivity = Date.now();

    context.log.debug('Client joined stream', {
      clientId: client.clientId,
      videoId,
    });

    // Send current viewer count for this stream
    const viewerCount = this.countViewersForVideo(videoId, context);
    const statsMessage: LiveStreamStatsMessage = {
      eventName: 'live_stream_stats',
      watchingCount: viewerCount,
    };

    context.sendTo(client, statsMessage);
  }

  /**
   * Handle client leaving a stream
   */
  private handleLeaveStream(client: ExtendedWebSocket, context: HandlerContext): void {
    const previousVideoId = client.videoId;
    delete client.videoId;

    if (previousVideoId !== undefined) {
      context.log.debug('Client left stream', {
        clientId: client.clientId,
        videoId: previousVideoId,
      });
    }
  }

  /**
   * Handle stream started event (from admin)
   */
  private handleStreamStarted(
    _client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    const { videoId } = message;

    if (videoId === undefined || videoId === '') {
      return;
    }

    context.log.info('Live stream started', { videoId });

    // Broadcast to all clients
    const broadcastMessage: LiveStreamStartedMessage = {
      eventName: 'live_stream_started',
      videoId,
    };
    context.broadcast(broadcastMessage, videoId);
  }

  /**
   * Handle stream stopped event
   */
  private handleStreamStopped(
    _client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    const { videoId } = message;

    if (videoId === undefined || videoId === '') {
      return;
    }

    context.log.info('Live stream stopped', { videoId });

    // Broadcast to all clients
    const broadcastMessage: LiveStreamStoppedMessage = {
      eventName: 'live_stream_stopped',
      videoId,
    };
    context.broadcast(broadcastMessage, videoId);
  }

  /**
   * Count viewers for a specific video
   */
  private countViewersForVideo(videoId: string, context: HandlerContext): number {
    let count = 0;
    for (const client of context.getClients()) {
      if (client.socketType === 'node_peer' && client.videoId === videoId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Called when a client disconnects
   * Update viewer counts
   */
  override onDisconnect(client: ExtendedWebSocket, context: HandlerContext): void {
    if (client.videoId !== undefined && client.socketType === 'node_peer') {
      context.log.debug('Stream viewer disconnected', {
        clientId: client.clientId,
        videoId: client.videoId,
      });
    }
  }
}
