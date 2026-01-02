/**
 * Upload Tracker Service Tests
 *
 * Tests for the UploadTrackerService class that tracks active file uploads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadTrackerService } from '@/services/upload-tracker.js';
import type { Logger } from '@/utils/logger.js';
import type { WebSocketService } from '@/services/websocket.js';
import type { FastifyRequest } from 'fastify';

describe('UploadTrackerService', () => {
  let service: UploadTrackerService;
  let mockLogger: Logger;
  let mockWebSocketService: WebSocketService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockWebSocketService = {
      broadcastToNodes: vi.fn(),
    } as unknown as WebSocketService;

    service = new UploadTrackerService(mockWebSocketService, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an UploadTrackerService instance', () => {
      expect(service).toBeInstanceOf(UploadTrackerService);
    });
  });

  describe('startTracking', () => {
    it('should start tracking an upload', () => {
      service.startTracking('video123', 'mp4', '1080p');

      expect(service.isTracking('video123')).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Started tracking upload', {
        videoId: 'video123',
        format: 'mp4',
        resolution: '1080p',
      });
    });

    it('should not restart tracking if already tracking', () => {
      service.startTracking('video123', 'mp4', '1080p');
      service.startTracking('video123', 'webm', '720p');

      // Should only log once (first call)
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });

    it('should track without format and resolution', () => {
      service.startTracking('video123');

      expect(service.isTracking('video123')).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Started tracking upload', {
        videoId: 'video123',
        format: undefined,
        resolution: undefined,
      });
    });
  });

  describe('addRequest', () => {
    it('should add a request to tracking', () => {
      const mockRequest = { raw: { destroy: vi.fn() } } as unknown as FastifyRequest;

      service.startTracking('video123');
      service.addRequest('video123', mockRequest);

      // No direct way to verify, but should not throw
      expect(service.isTracking('video123')).toBe(true);
    });

    it('should not throw if video is not being tracked', () => {
      const mockRequest = {} as FastifyRequest;

      expect(() => service.addRequest('nonexistent', mockRequest)).not.toThrow();
    });
  });

  describe('isStopping', () => {
    it('should return false initially', () => {
      service.startTracking('video123');

      expect(service.isStopping('video123')).toBe(false);
    });

    it('should return true after signalStop', () => {
      service.startTracking('video123');
      service.signalStop('video123');

      expect(service.isStopping('video123')).toBe(true);
    });

    it('should return false for untracked video', () => {
      expect(service.isStopping('nonexistent')).toBe(false);
    });
  });

  describe('isTracking', () => {
    it('should return true for tracked video', () => {
      service.startTracking('video123');

      expect(service.isTracking('video123')).toBe(true);
    });

    it('should return false for untracked video', () => {
      expect(service.isTracking('nonexistent')).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('should update progress for tracked video', () => {
      service.startTracking('video123');
      service.updateProgress('video123', 50);

      expect(service.getProgress('video123')).toBe(50);
    });

    it('should not throw for untracked video', () => {
      expect(() => service.updateProgress('nonexistent', 50)).not.toThrow();
    });
  });

  describe('getProgress', () => {
    it('should return progress for tracked video', () => {
      service.startTracking('video123');
      service.updateProgress('video123', 75);

      expect(service.getProgress('video123')).toBe(75);
    });

    it('should return 0 for untracked video', () => {
      expect(service.getProgress('nonexistent')).toBe(0);
    });

    it('should return 0 initially', () => {
      service.startTracking('video123');

      expect(service.getProgress('video123')).toBe(0);
    });
  });

  describe('signalStop', () => {
    it('should signal stop for tracked upload', () => {
      service.startTracking('video123', 'mp4', '1080p');
      service.signalStop('video123');

      expect(service.isStopping('video123')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Upload stop signaled', { videoId: 'video123' });
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
          data: expect.objectContaining({
            eventName: 'video_status',
            payload: expect.objectContaining({
              type: 'stopping',
              videoId: 'video123',
            }),
          }),
        })
      );
    });

    it('should not throw for untracked video', () => {
      expect(() => service.signalStop('nonexistent')).not.toThrow();
    });
  });

  describe('completeStop', () => {
    it('should complete stop and destroy requests', () => {
      const mockDestroy = vi.fn();
      const mockRequest = { raw: { destroy: mockDestroy } } as unknown as FastifyRequest;

      service.startTracking('video123', 'mp4', '1080p');
      service.addRequest('video123', mockRequest);
      service.completeStop('video123');

      expect(service.isTracking('video123')).toBe(false);
      expect(mockDestroy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Upload stopped', { videoId: 'video123' });
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
          data: expect.objectContaining({
            eventName: 'video_status',
            payload: expect.objectContaining({
              type: 'stopped',
              videoId: 'video123',
            }),
          }),
        })
      );
    });

    it('should handle errors during request destruction', () => {
      const mockRequest = {
        raw: {
          destroy: vi.fn().mockImplementation(() => {
            throw new Error('Destroy failed');
          }),
        },
      } as unknown as FastifyRequest;

      service.startTracking('video123');
      service.addRequest('video123', mockRequest);

      expect(() => service.completeStop('video123')).not.toThrow();
      expect(service.isTracking('video123')).toBe(false);
    });

    it('should not throw for untracked video', () => {
      expect(() => service.completeStop('nonexistent')).not.toThrow();
    });
  });

  describe('stopTracking', () => {
    it('should stop tracking and broadcast completed event', () => {
      service.startTracking('video123', 'mp4', '1080p');
      service.stopTracking('video123');

      expect(service.isTracking('video123')).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Stopped tracking upload', {
        videoId: 'video123',
      });
      expect(mockWebSocketService.broadcastToNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'echo',
          data: expect.objectContaining({
            eventName: 'video_status',
            payload: expect.objectContaining({
              type: 'completed',
              videoId: 'video123',
            }),
          }),
        })
      );
    });

    it('should not throw for untracked video', () => {
      expect(() => service.stopTracking('nonexistent')).not.toThrow();
    });

    it('should not broadcast if state is somehow null', () => {
      // This tests the defensive 'if (state)' check at line 146
      // We need to manually manipulate the internal tracker to set a null value
      // Access private tracker via any
      const internalTracker = (service as any).tracker as Map<string, any>;
      internalTracker.set('video123', null);

      // stopTracking should not throw and should not broadcast
      service.stopTracking('video123');

      // Should log (because has() returns true)
      expect(mockLogger.debug).toHaveBeenCalledWith('Stopped tracking upload', {
        videoId: 'video123',
      });

      // Should NOT broadcast because state is null
      expect(mockWebSocketService.broadcastToNodes).not.toHaveBeenCalled();
    });
  });

  describe('getActiveUploads', () => {
    it('should return all active upload video IDs', () => {
      service.startTracking('video1');
      service.startTracking('video2');
      service.startTracking('video3');

      const uploads = service.getActiveUploads();

      expect(uploads).toHaveLength(3);
      expect(uploads).toContain('video1');
      expect(uploads).toContain('video2');
      expect(uploads).toContain('video3');
    });

    it('should return empty array when no active uploads', () => {
      expect(service.getActiveUploads()).toEqual([]);
    });

    it('should not include stopped uploads', () => {
      service.startTracking('video1');
      service.startTracking('video2');
      service.stopTracking('video1');

      const uploads = service.getActiveUploads();

      expect(uploads).toHaveLength(1);
      expect(uploads).toContain('video2');
    });
  });
});
