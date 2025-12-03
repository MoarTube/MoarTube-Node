/**
 * Video Status Handler
 *
 * Handles video status update events including importing,
 * publishing, and processing status changes.
 */

import type {
  ExtendedWebSocket,
  IncomingWebSocketMessage,
  VideoStatusMessage,
  WebSocketMessage,
} from '../../types/websocket.js';
import { type HandlerContext, WebSocketHandler } from './base.js';

/**
 * Handler for video status events
 */
export class VideoStatusHandler extends WebSocketHandler {
  readonly name = 'VideoStatusHandler';

  /**
   * Event names this handler responds to
   */
  private readonly handledEvents = new Set([
    'video_importing',
    'video_imported',
    'video_publishing',
    'video_published',
    'video_error',
    'video_finalized',
    'video_status',
    'video_data',
  ]);

  /**
   * Check if this is a video status event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return this.handledEvents.has(message.eventName);
  }

  /**
   * Handle video status events
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    const { videoId } = message;

    if (videoId === undefined || videoId === '') {
      context.log.warn('Video status event without videoId', {
        eventName: message.eventName,
        clientId: client.clientId,
      });
      return;
    }

    // Map event names to status values
    const statusMap: Record<string, VideoStatusMessage['status']> = {
      video_importing: 'importing',
      video_imported: 'imported',
      video_publishing: 'publishing',
      video_published: 'published',
      video_error: 'error',
      video_finalized: 'finalized',
    };

    const status = statusMap[message.eventName];

    if (status !== undefined) {
      const statusMessage: VideoStatusMessage = {
        eventName: 'video_status',
        videoId,
        status,
      };

      context.log.debug('Broadcasting video status', {
        videoId,
        status,
      });

      // Broadcast to all admin clients
      this.broadcastToAdmins(statusMessage, context);
    } else if (message.eventName === 'video_status' || message.eventName === 'video_data') {
      // Forward the message as-is
      context.log.debug('Forwarding video event', {
        eventName: message.eventName,
        videoId,
      });

      this.broadcastToAdmins(message as WebSocketMessage, context);
    }
  }

  /**
   * Broadcast message to admin clients
   */
  private broadcastToAdmins(message: WebSocketMessage, context: HandlerContext): void {
    for (const client of context.getClients()) {
      if (client.socketType === 'admin' || client.isAuthenticated === true) {
        context.sendTo(client, message);
      }
    }
  }
}
