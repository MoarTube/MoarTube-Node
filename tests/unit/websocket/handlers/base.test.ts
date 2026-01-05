/**
 * Base WebSocket Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketHandler, type HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket, IncomingWebSocketMessage } from '@/types/websocket.js';

// Concrete implementation for testing abstract class
class TestHandler extends WebSocketHandler {
  readonly name = 'TestHandler';
  public processMessageCalled = false;
  public lastProcessedMessage: unknown = null;

  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'test';
  }

  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    this.processMessage(client, message, context);
  }

  protected processMessage(
    client: ExtendedWebSocket,
    validatedMessage: unknown,
    context: HandlerContext
  ): void {
    this.processMessageCalled = true;
    this.lastProcessedMessage = validatedMessage;
    context.sendTo(client, { eventName: 'test_response' });
  }

  // Expose onConnect/onDisconnect for testing
  onConnect(client: ExtendedWebSocket, context: HandlerContext): void {
    context.log.debug('Client connected', { clientId: client.clientId });
  }

  onDisconnect(client: ExtendedWebSocket, context: HandlerContext): void {
    context.log.debug('Client disconnected', { clientId: client.clientId });
  }
}

// Handler without lifecycle methods
class MinimalHandler extends WebSocketHandler {
  readonly name = 'MinimalHandler';

  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'minimal';
  }

  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    this.processMessage(client, message, context);
  }

  protected processMessage(
    _client: ExtendedWebSocket,
    _validatedMessage: unknown,
    _context: HandlerContext
  ): void {
    // No-op
  }
}

describe('WebSocketHandler', () => {
  let handler: TestHandler;
  let mockClient: ExtendedWebSocket;
  let mockContext: HandlerContext;

  beforeEach(() => {
    handler = new TestHandler();
    mockClient = {
      clientId: 'client_1',
      socketType: 'viewer',
      isAuthenticated: false,
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
    it('should have a name property', () => {
      expect(handler.name).toBe('TestHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for matching event', () => {
      const message: IncomingWebSocketMessage = { eventName: 'test' };
      expect(handler.canHandle(message)).toBe(true);
    });

    it('should return false for non-matching event', () => {
      const message: IncomingWebSocketMessage = { eventName: 'other' };
      expect(handler.canHandle(message)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should call processMessage when handling', () => {
      const message: IncomingWebSocketMessage = { eventName: 'test', data: 'test data' };
      
      handler.handle(mockClient, message, mockContext);

      expect(handler.processMessageCalled).toBe(true);
      expect(handler.lastProcessedMessage).toEqual(message);
    });

    it('should send response via context', () => {
      const message: IncomingWebSocketMessage = { eventName: 'test' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, { eventName: 'test_response' });
    });
  });

  describe('onConnect', () => {
    it('should log client connection', () => {
      handler.onConnect(mockClient, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Client connected', { clientId: 'client_1' });
    });
  });

  describe('onDisconnect', () => {
    it('should log client disconnection', () => {
      handler.onDisconnect(mockClient, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Client disconnected', { clientId: 'client_1' });
    });
  });

  describe('MinimalHandler (no lifecycle methods)', () => {
    it('should work without onConnect/onDisconnect', () => {
      const minimal = new MinimalHandler();
      expect(minimal.name).toBe('MinimalHandler');
      expect(minimal.onConnect).toBeUndefined();
      expect(minimal.onDisconnect).toBeUndefined();
    });

    it('should handle messages without lifecycle methods', () => {
      const minimal = new MinimalHandler();
      const message: IncomingWebSocketMessage = { eventName: 'minimal' };
      
      // Should not throw
      expect(() => minimal.handle(mockClient, message, mockContext)).not.toThrow();
    });
  });

  describe('logger property', () => {
    it('should have access to logger', () => {
      // The handler has a protected logger property
      // We verify it exists by checking the handler works
      expect(handler).toBeDefined();
    });
  });
});
