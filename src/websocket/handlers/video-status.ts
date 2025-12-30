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
} from '@/types/websocket.js';
import { type HandlerContext, WebSocketHandler } from '@websocket/handlers/base.js';
import { videoStatusEventSchema, type VideoStatusEvent } from '@validators/schemas/index.js';
import { ZodError } from 'zod';

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
    try {
      const statusEvent = videoStatusEventSchema.parse(message);
      this.processMessage(statusEvent, context);
    } catch (error) {
      if (error instanceof ZodError) {
        context.log.warn('Invalid video status event format', {
          errors: error.issues,
          clientId: client.clientId,
        });
      } else {
        context.log.error('Error parsing video status event', error, { clientId: client.clientId });
      }
    }
  }

  /**
   * Process validated video status message
   */
  protected processMessage(validatedMessage: unknown, context: HandlerContext): void {
    const statusEvent = validatedMessage as VideoStatusEvent;
    const { eventName, videoId } = statusEvent;

    // Map event names to status values
    const statusMap: Record<string, VideoStatusMessage['status']> = {
      video_importing: 'importing',
      video_imported: 'imported',
      video_publishing: 'publishing',
      video_published: 'published',
      video_error: 'error',
      video_finalized: 'finalized',
    };

    const status = statusMap[eventName];

    if (status !== undefined && videoId !== undefined) {
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
    } else if (eventName === 'video_status' || eventName === 'video_data') {
      // Forward the message as-is
      context.log.debug('Forwarding video event', {
        eventName,
        videoId,
      });

      this.broadcastToAdmins(statusEvent as WebSocketMessage, context);
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
