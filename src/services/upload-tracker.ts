/**
 * Upload Tracker Service
 *
 * Tracks active file uploads and supports cancellation.
 * TypeScript port of utils/trackers/publish-video-uploading-tracker.js
 */

import type { FastifyRequest } from 'fastify';
import type { Logger } from '../utils/logger.js';
import { type WebSocketService } from './websocket.js';

/**
 * Upload tracking state for a single video
 */
interface VideoUploadState {
  /** Active upload requests that can be cancelled */
  uploadRequests: FastifyRequest[];
  /** Whether upload is in the process of stopping */
  stopping: boolean;
  /** Upload progress (0-100) */
  progress: number;
  /** Format being uploaded */
  format?: string | undefined;
  /** Resolution being uploaded */
  resolution?: string | undefined;
}

export interface IUploadTrackerService {
  /** Start tracking an upload for a video */
  startTracking(videoId: string, format?: string, resolution?: string): void;

  /** Add a request to the tracking */
  addRequest(videoId: string, request: FastifyRequest): void;

  /** Check if upload is being stopped */
  isStopping(videoId: string): boolean;

  /** Check if video has active upload */
  isTracking(videoId: string): boolean;

  /** Update upload progress */
  updateProgress(videoId: string, progress: number): void;

  /** Get upload progress */
  getProgress(videoId: string): number;

  /** Signal upload should stop */
  signalStop(videoId: string): void;

  /** Complete stopping and clean up */
  completeStop(videoId: string): void;

  /** Stop tracking (upload completed) */
  stopTracking(videoId: string): void;

  /** Get all active uploads */
  getActiveUploads(): string[];
}

export class UploadTrackerService implements IUploadTrackerService {
  private readonly tracker = new Map<string, VideoUploadState>();
  private readonly websocketService: WebSocketService;
  private readonly logger: Logger;

  constructor(websocketService: WebSocketService, logger: Logger) {
    this.websocketService = websocketService;
    this.logger = logger;
  }

  /**
   * Start tracking an upload for a video
   */
  startTracking(videoId: string, format?: string, resolution?: string): void {
    if (!this.tracker.has(videoId)) {
      this.tracker.set(videoId, {
        uploadRequests: [],
        stopping: false,
        progress: 0,
        format,
        resolution,
      });

      this.logger.debug('Started tracking upload', { videoId, format, resolution });
    }
  }

  /**
   * Add a request to the tracking
   */
  addRequest(videoId: string, request: FastifyRequest): void {
    const state = this.tracker.get(videoId);
    if (state) {
      state.uploadRequests.push(request);
    }
  }

  /**
   * Check if upload is being stopped
   */
  isStopping(videoId: string): boolean {
    return this.tracker.get(videoId)?.stopping ?? false;
  }

  /**
   * Check if video has active upload
   */
  isTracking(videoId: string): boolean {
    return this.tracker.has(videoId);
  }

  /**
   * Update upload progress
   */
  updateProgress(videoId: string, progress: number): void {
    const state = this.tracker.get(videoId);
    if (state) {
      state.progress = progress;
    }
  }

  /**
   * Get upload progress
   */
  getProgress(videoId: string): number {
    return this.tracker.get(videoId)?.progress ?? 0;
  }

  /**
   * Signal upload should stop
   */
  signalStop(videoId: string): void {
    const state = this.tracker.get(videoId);
    if (state) {
      state.stopping = true;

      this.logger.info('Upload stop signaled', { videoId });

      // Broadcast stopping event
      this.broadcastUploadEvent(videoId, 'stopping', state);
    }
  }

  /**
   * Complete stopping and clean up
   */
  completeStop(videoId: string): void {
    const state = this.tracker.get(videoId);
    if (state) {
      // Destroy all active requests
      for (const request of state.uploadRequests) {
        try {
          request.raw.destroy();
        } catch {
          // Ignore errors during cleanup
        }
      }

      this.tracker.delete(videoId);

      this.logger.info('Upload stopped', { videoId });

      // Broadcast stopped event
      this.broadcastUploadEvent(videoId, 'stopped', state);
    }
  }

  /**
   * Stop tracking (upload completed normally)
   */
  stopTracking(videoId: string): void {
    if (this.tracker.has(videoId)) {
      const state = this.tracker.get(videoId);
      this.tracker.delete(videoId);

      this.logger.debug('Stopped tracking upload', { videoId });

      // Broadcast completed event
      if (state) {
        this.broadcastUploadEvent(videoId, 'completed', state);
      }
    }
  }

  /**
   * Get all active uploads
   */
  getActiveUploads(): string[] {
    return Array.from(this.tracker.keys());
  }

  /**
   * Broadcast upload status event via WebSocket
   */
  private broadcastUploadEvent(
    videoId: string,
    type: 'publishing' | 'stopping' | 'stopped' | 'completed',
    state: VideoUploadState
  ): void {
    this.websocketService.broadcastToNodes({
      eventName: 'echo',
      data: {
        eventName: 'video_status',
        payload: {
          type,
          videoId,
          format: state.format,
          resolution: state.resolution,
          progress: state.progress,
        },
      },
    });
  }
}
