/**
 * Echo Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EchoHandler } from '@websocket/handlers/echo.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/websocket.js';

describe('EchoHandler', () => {
  let handler: EchoHandler;
  let mockClient: ExtendedWebSocket;
  let mockContext: HandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new EchoHandler();
    
    mockClient = {
      clientId: 'client_1',
      socketType: 'admin',
      isAuthenticated: true,
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as ExtendedWebSocket;

    mockContext = {
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      getClients: vi.fn().mockReturnValue(new Set([mockClient])),
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
      expect(handler.name).toBe('EchoHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for echo event', () => {
      expect(handler.canHandle({ eventName: 'echo' })).toBe(true);
    });

    it('should return false for non-echo events', () => {
      expect(handler.canHandle({ eventName: 'register' })).toBe(false);
      expect(handler.canHandle({ eventName: 'chat' })).toBe(false);
      expect(handler.canHandle({ eventName: 'video_status' })).toBe(false);
    });
  });

  describe('handle - authorization', () => {
    it('should allow admin clients to broadcast', () => {
      mockClient.socketType = 'admin';
      mockClient.isAuthenticated = false;
      const message = {
        eventName: 'echo',
        data: { eventName: 'test_broadcast', payload: { someData: 'value' } },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(message);
    });

    it('should allow moartube_client to broadcast', () => {
      mockClient.socketType = 'moartube_client';
      mockClient.isAuthenticated = false;
      const message = {
        eventName: 'echo',
        data: { eventName: 'test_broadcast' },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(message);
    });

    it('should allow authenticated clients to broadcast', () => {
      mockClient.socketType = 'viewer';
      mockClient.isAuthenticated = true;
      const message = {
        eventName: 'echo',
        data: { eventName: 'test_broadcast' },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(message);
    });

    it('should reject unauthorized viewer clients', () => {
      mockClient.socketType = 'viewer';
      mockClient.isAuthenticated = false;
      const message = {
        eventName: 'echo',
        data: { eventName: 'test_broadcast' },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith('Unauthorized echo attempt', {
        clientId: 'client_1',
      });
      expect(mockContext.broadcast).not.toHaveBeenCalled();
    });

    it('should reject undefined socketType with isAuthenticated false', () => {
      mockClient.socketType = undefined as unknown as string;
      mockClient.isAuthenticated = false;
      const message = {
        eventName: 'echo',
        data: { eventName: 'test_broadcast' },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith('Unauthorized echo attempt', {
        clientId: 'client_1',
      });
      expect(mockContext.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('handle - valid messages', () => {
    it('should broadcast echo message with eventName in data', () => {
      const message = {
        eventName: 'echo',
        data: { eventName: 'custom_event', payload: { key: 'value' } },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(message);
      expect(mockContext.log.debug).toHaveBeenCalledWith('Broadcasting echo message', {
        eventName: 'custom_event',
      });
    });

    it('should broadcast echo message with complex data', () => {
      const message = {
        eventName: 'echo',
        data: {
          eventName: 'video_update',
          payload: {
            videoId: 'abc123',
            status: 'published',
            views: 1000,
          },
        },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.broadcast).toHaveBeenCalledWith(message);
    });
  });

  describe('handle - validation errors', () => {
    it('should log warning for missing data field', () => {
      const message = { eventName: 'echo' }; // Missing data

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid echo message format',
        expect.objectContaining({
          errors: expect.any(Array),
          clientId: 'client_1',
        })
      );
      expect(mockContext.broadcast).not.toHaveBeenCalled();
    });

    it('should log warning for missing eventName in data', () => {
      const message = {
        eventName: 'echo',
        data: { noEventName: true }, // Missing eventName in data
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid echo message format',
        expect.objectContaining({
          errors: expect.any(Array),
        })
      );
    });

    it('should log warning for invalid data type', () => {
      const message = {
        eventName: 'echo',
        data: 'not an object',
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log debug message when broadcasting', () => {
      const message = {
        eventName: 'echo',
        data: { eventName: 'status_update' },
      };

      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Broadcasting echo message', {
        eventName: 'status_update',
      });
    });
  });

  describe('non-Zod error handling', () => {
    it('should log error for non-Zod errors during parsing', async () => {
      // We need to test the else branch when a non-ZodError is thrown
      // Create a custom handler that throws a generic error
      const { EchoHandler: OriginalHandler } = await import('@websocket/handlers/echo.js');
      
      // Create a subclass that throws a generic error in processMessage
      class TestableEchoHandler extends OriginalHandler {
        protected processMessage(): void {
          throw new Error('Unexpected error during processing');
        }
      }

      const testHandler = new TestableEchoHandler();
      const validMessage = {
        eventName: 'echo',
        data: { eventName: 'test_event' },
      };

      testHandler.handle(mockClient, validMessage, mockContext);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error parsing echo message',
        expect.any(Error),
        { clientId: 'client_1' }
      );
    });
  });
});
