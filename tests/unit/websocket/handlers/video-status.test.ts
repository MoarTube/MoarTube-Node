/**
 * Video Status Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoStatusHandler } from '@websocket/handlers/video-status.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/websocket.js';

describe('VideoStatusHandler', () => {
  let handler: VideoStatusHandler;
  let mockClient: ExtendedWebSocket;
  let mockAdminClient: ExtendedWebSocket;
  let mockViewerClient: ExtendedWebSocket;
  let mockContext: HandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new VideoStatusHandler();
    
    mockClient = {
      clientId: 'client_1',
      socketType: 'moartube_client',
      isAuthenticated: false,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as ExtendedWebSocket;

    mockAdminClient = {
      clientId: 'admin_1',
      socketType: 'admin',
      isAuthenticated: true,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as ExtendedWebSocket;

    mockViewerClient = {
      clientId: 'viewer_1',
      socketType: 'viewer',
      isAuthenticated: false,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as ExtendedWebSocket;

    mockContext = {
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      getClients: vi.fn().mockReturnValue(new Set([mockClient, mockAdminClient, mockViewerClient])),
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as unknown as HandlerContext;
  });

  describe('name property', () => {
    it('should have correct name', () => {
      expect(handler.name).toBe('VideoStatusHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for video_importing', () => {
      expect(handler.canHandle({ eventName: 'video_importing' })).toBe(true);
    });

    it('should return true for video_imported', () => {
      expect(handler.canHandle({ eventName: 'video_imported' })).toBe(true);
    });

    it('should return true for video_publishing', () => {
      expect(handler.canHandle({ eventName: 'video_publishing' })).toBe(true);
    });

    it('should return true for video_published', () => {
      expect(handler.canHandle({ eventName: 'video_published' })).toBe(true);
    });

    it('should return true for video_error', () => {
      expect(handler.canHandle({ eventName: 'video_error' })).toBe(true);
    });

    it('should return true for video_finalized', () => {
      expect(handler.canHandle({ eventName: 'video_finalized' })).toBe(true);
    });

    it('should return true for video_status', () => {
      expect(handler.canHandle({ eventName: 'video_status' })).toBe(true);
    });

    it('should return true for video_data', () => {
      expect(handler.canHandle({ eventName: 'video_data' })).toBe(true);
    });

    it('should return false for non-video events', () => {
      expect(handler.canHandle({ eventName: 'echo' })).toBe(false);
      expect(handler.canHandle({ eventName: 'chat' })).toBe(false);
      expect(handler.canHandle({ eventName: 'register' })).toBe(false);
    });
  });

  describe('handle - video importing', () => {
    it('should broadcast video_importing status to admin clients', () => {
      const message = { eventName: 'video_importing', videoId: 'testvideo01' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo01',
        status: 'importing',
      });
      // Should also send to authenticated viewer
      expect(mockContext.log.debug).toHaveBeenCalledWith('Broadcasting video status', {
        videoId: 'testvideo01',
        status: 'importing',
      });
    });
  });

  describe('handle - video imported', () => {
    it('should broadcast video_imported status to admin clients', () => {
      const message = { eventName: 'video_imported', videoId: 'testvideo02' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo02',
        status: 'imported',
      });
    });
  });

  describe('handle - video publishing', () => {
    it('should broadcast video_publishing status to admin clients', () => {
      const message = { eventName: 'video_publishing', videoId: 'testvideo03' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo03',
        status: 'publishing',
      });
    });
  });

  describe('handle - video published', () => {
    it('should broadcast video_published status to admin clients', () => {
      const message = { eventName: 'video_published', videoId: 'testvideo04' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo04',
        status: 'published',
      });
    });
  });

  describe('handle - video error', () => {
    it('should broadcast video_error status to admin clients', () => {
      const message = { eventName: 'video_error', videoId: 'testvideo05' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo05',
        status: 'error',
      });
    });
  });

  describe('handle - video finalized', () => {
    it('should broadcast video_finalized status to admin clients', () => {
      const message = { eventName: 'video_finalized', videoId: 'testvideo06' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, {
        eventName: 'video_status',
        videoId: 'testvideo06',
        status: 'finalized',
      });
    });
  });

  describe('handle - video_status forwarding', () => {
    it('should forward video_status message as-is to admin clients', () => {
      const message = { eventName: 'video_status', videoId: 'testvideo07' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Forwarding video event', {
        eventName: 'video_status',
        videoId: 'testvideo07',
      });
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, { eventName: 'video_status', videoId: 'testvideo07' });
    });
  });

  describe('handle - video_data forwarding', () => {
    it('should forward video_data message as-is to admin clients', () => {
      const message = { 
        eventName: 'video_data', 
        videoId: 'testvideo08', 
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Forwarding video event', {
        eventName: 'video_data',
        videoId: 'testvideo08',
      });
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockAdminClient, { eventName: 'video_data', videoId: 'testvideo08' });
    });
  });

  describe('handle - broadcast to authenticated clients', () => {
    it('should send to authenticated non-admin clients', () => {
      mockViewerClient.isAuthenticated = true;
      const message = { eventName: 'video_importing', videoId: 'testvideo09' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockViewerClient, expect.any(Object));
    });

    it('should not send to unauthenticated viewer clients', () => {
      mockViewerClient.isAuthenticated = false;
      mockViewerClient.socketType = 'viewer';
      const message = { eventName: 'video_importing', videoId: 'testvideo10' };

      handler.handle(mockClient, message, mockContext);

      // Check that sendTo was not called with viewerClient
      const sendToCalls = (mockContext.sendTo as ReturnType<typeof vi.fn>).mock.calls;
      const calledWithViewer = sendToCalls.some((call: [ExtendedWebSocket, unknown]) => call[0].clientId === 'viewer_1');
      expect(calledWithViewer).toBe(false);
    });
  });

  describe('handle - validation errors', () => {
    it('should log warning for invalid videoId format', () => {
      const message = { eventName: 'video_importing', videoId: 'bad' }; // Invalid format

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid video status event format',
        expect.objectContaining({
          errors: expect.any(Array),
          clientId: 'client_1',
        })
      );
    });

    it('should log warning for invalid eventName', () => {
      const message = { eventName: 'video_unknown', videoId: 'testvideo11' };

      handler.handle(mockClient, message, mockContext);

      // Should still be logged as warning due to Zod validation
      expect(mockContext.log.warn).toHaveBeenCalled();
    });

    it('should log warning for invalid videoId type', () => {
      const message = { eventName: 'video_importing', videoId: 123 };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
    });
  });

  describe('handle - edge cases', () => {
    it('should handle empty client set', () => {
      (mockContext.getClients as ReturnType<typeof vi.fn>).mockReturnValue(new Set());
      const message = { eventName: 'video_importing', videoId: 'testvideo12' };

      // Should not throw
      expect(() => handler.handle(mockClient, message, mockContext)).not.toThrow();
      expect(mockContext.sendTo).not.toHaveBeenCalled();
    });

    it('should handle message without status mapping', () => {
      // video_status doesn't have a status mapping, uses forwarding
      const message = { eventName: 'video_status', videoId: 'testvideo13' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Forwarding video event', {
        eventName: 'video_status',
        videoId: 'testvideo13',
      });
    });

    it('should not broadcast when status exists but videoId is undefined', () => {
      // Test when status is valid but videoId is missing - neither if nor else-if applies
      const message = { eventName: 'video_importing' };

      handler.handle(mockClient, message, mockContext);

      // No debug log for broadcasting since condition fails
      expect(mockContext.log.debug).not.toHaveBeenCalledWith('Broadcasting video status', expect.any(Object));
    });

    it('should forward video_data without videoId', () => {
      // video_data with undefined videoId still forwards
      const message = { eventName: 'video_data' };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Forwarding video event', {
        eventName: 'video_data',
        videoId: undefined,
      });
    });
  });

  describe('non-Zod error handling', () => {
    it('should log error for non-Zod errors during parsing', async () => {
      // Test the else branch when a non-ZodError is thrown
      const { VideoStatusHandler: OriginalHandler } = await import('@websocket/handlers/video-status.js');
      
      // Create a subclass that throws a generic error in processMessage
      class TestableVideoStatusHandler extends OriginalHandler {
        protected processMessage(): void {
          throw new Error('Unexpected error during video status processing');
        }
      }

      const testHandler = new TestableVideoStatusHandler();
      const validMessage = {
        eventName: 'video_importing',
        videoId: 'testvideo01',
      };

      testHandler.handle(mockClient, validMessage, mockContext);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error parsing video status event',
        expect.any(Error),
        { clientId: 'client_1' }
      );
    });
  });
});
