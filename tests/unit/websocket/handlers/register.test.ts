/**
 * Register Handler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RegisterHandler } from '@websocket/handlers/register.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/websocket.js';
import jwt from 'jsonwebtoken';

// Mock getConfig
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    jwtSecret: 'test-secret-key',
  }),
}));

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let mockClient: ExtendedWebSocket;
  let mockContext: HandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new RegisterHandler();
    
    mockClient = {
      clientId: 'client_1',
      socketType: undefined,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name property', () => {
    it('should have correct name', () => {
      expect(handler.name).toBe('RegisterHandler');
    });
  });

  describe('canHandle', () => {
    it('should return true for register event', () => {
      expect(handler.canHandle({ eventName: 'register' })).toBe(true);
    });

    it('should return false for non-register event', () => {
      expect(handler.canHandle({ eventName: 'echo' })).toBe(false);
      expect(handler.canHandle({ eventName: 'chat' })).toBe(false);
      expect(handler.canHandle({ eventName: 'other' })).toBe(false);
    });
  });

  describe('handle - basic registration', () => {
    it('should register client with socketType viewer', () => {
      const message = { eventName: 'register', socketType: 'viewer' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.socketType).toBe('viewer');
      expect(mockClient.isAuthenticated).toBe(false);
      expect(mockContext.sendTo).toHaveBeenCalledWith(mockClient, { eventName: 'registered' });
    });

    it('should register client with socketType admin', () => {
      const message = { eventName: 'register', socketType: 'admin' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.socketType).toBe('admin');
      expect(mockClient.isAuthenticated).toBe(false);
    });

    it('should register client with socketType moartube_client', () => {
      const message = { eventName: 'register', socketType: 'moartube_client' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.socketType).toBe('moartube_client');
      expect(mockClient.isAuthenticated).toBe(false);
    });
  });

  describe('handle - with JWT token', () => {
    it('should authenticate client with valid JWT token', () => {
      const validToken = jwt.sign({ userId: '123' }, 'test-secret-key');
      const message = { eventName: 'register', socketType: 'admin', jwtToken: validToken };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.socketType).toBe('admin');
      expect(mockClient.isAuthenticated).toBe(true);
      expect(mockContext.log.debug).toHaveBeenCalledWith('Client registered', {
        clientId: 'client_1',
        socketType: 'admin',
        isAuthenticated: true,
      });
    });

    it('should not authenticate client with invalid JWT token', () => {
      const message = { eventName: 'register', socketType: 'admin', jwtToken: 'invalid-token' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.socketType).toBe('admin');
      expect(mockClient.isAuthenticated).toBe(false);
    });

    it('should not authenticate client with wrong secret JWT token', () => {
      const invalidToken = jwt.sign({ userId: '123' }, 'wrong-secret');
      const message = { eventName: 'register', socketType: 'admin', jwtToken: invalidToken };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.isAuthenticated).toBe(false);
    });

    it('should not authenticate with empty string JWT token', () => {
      const message = { eventName: 'register', socketType: 'viewer', jwtToken: '' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.isAuthenticated).toBe(false);
    });

    it('should not authenticate with undefined JWT token', () => {
      const message = { eventName: 'register', socketType: 'viewer', jwtToken: undefined };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.isAuthenticated).toBe(false);
    });
  });

  describe('handle - validation errors', () => {
    it('should log warning for invalid message format', () => {
      const message = { eventName: 'register' }; // Missing socketType
      
      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalledWith(
        'Invalid register event format',
        expect.objectContaining({
          errors: expect.any(Array),
          clientId: 'client_1',
        })
      );
    });

    it('should log warning for invalid socketType', () => {
      const message = { eventName: 'register', socketType: 'invalid_type' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
    });

    it('should log warning for wrong data types', () => {
      const message = { eventName: 'register', socketType: 123 };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.warn).toHaveBeenCalled();
    });
  });

  describe('handle - expired JWT token', () => {
    it('should not authenticate with expired JWT token', () => {
      const expiredToken = jwt.sign({ userId: '123' }, 'test-secret-key', { expiresIn: '-1s' });
      const message = { eventName: 'register', socketType: 'admin', jwtToken: expiredToken };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockClient.isAuthenticated).toBe(false);
    });
  });

  describe('logging', () => {
    it('should log client registration details', () => {
      const message = { eventName: 'register', socketType: 'viewer' };
      
      handler.handle(mockClient, message, mockContext);

      expect(mockContext.log.debug).toHaveBeenCalledWith('Client registered', {
        clientId: 'client_1',
        socketType: 'viewer',
        isAuthenticated: false,
      });
    });
  });

  describe('non-Zod error handling', () => {
    it('should log error for non-Zod errors during parsing', async () => {
      // Test the else branch when a non-ZodError is thrown
      const { RegisterHandler: OriginalHandler } = await import('@websocket/handlers/register.js');
      
      // Create a subclass that throws a generic error in processMessage
      class TestableRegisterHandler extends OriginalHandler {
        protected processMessage(): void {
          throw new Error('Unexpected error during registration');
        }
      }

      const testHandler = new TestableRegisterHandler();
      const validMessage = {
        eventName: 'register',
        socketType: 'viewer',
      };

      testHandler.handle(mockClient, validMessage, mockContext);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error parsing register event',
        expect.any(Error),
        { clientId: 'client_1' }
      );
    });
  });
});
