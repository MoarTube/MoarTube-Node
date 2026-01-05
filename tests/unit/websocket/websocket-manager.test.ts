/**
 * WebSocket Manager Tests
 * 
 * Tests the core WebSocket manager functionality without mocking handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketManager, type WebSocketManagerOptions } from '@websocket/websocket-manager.js';
import type { ExtendedWebSocket, WebSocketMessage } from '@/types/websocket.js';
import type { WebSocket as WsWebSocket } from 'ws';
import type { Container } from '@core/container.js';

describe('WebSocketManager', () => {
  let manager: WebSocketManager;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockContainer: Container;

  const createMockWebSocket = (
    overrides: Partial<ExtendedWebSocket> = {}
  ): WsWebSocket => {
    return {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      ...overrides,
    } as unknown as WsWebSocket;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockContainer = {
      resolve: vi.fn().mockImplementation((name: string) => {
        if (name === 'videosService') return { getVideo: vi.fn() };
        if (name === 'liveChatService') return { createMessage: vi.fn() };
        if (name === 'cloudflareService') return { validateTurnstileToken: vi.fn() };
        throw new Error(`Unknown service: ${name}`);
      }),
    } as unknown as Container;

    const options: WebSocketManagerOptions = {
      logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
      heartbeatInterval: 30000,
      clientTimeout: 60000,
    };

    manager = new WebSocketManager(options);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (manager) {
      manager.closeAll();
    }
  });

  describe('constructor', () => {
    it('should create manager with default options', () => {
      const defaultManager = new WebSocketManager();
      expect(defaultManager).toBeDefined();
      defaultManager.closeAll();
    });

    it('should create manager with custom options', () => {
      const customManager = new WebSocketManager({
        heartbeatInterval: 5000,
        clientTimeout: 10000,
      });
      expect(customManager).toBeDefined();
      customManager.closeAll();
    });

    it('should register handlers on creation', () => {
      // Verify handlers were registered by checking debug logs
      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler: VideoStatusHandler');
      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler: EchoHandler');
      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler: RegisterHandler');
    });
  });

  describe('setContainer', () => {
    it('should set container and register service handlers', () => {
      manager.setContainer(mockContainer);

      expect(mockContainer.resolve).toHaveBeenCalledWith('videosService');
      expect(mockContainer.resolve).toHaveBeenCalledWith('liveChatService');
      expect(mockContainer.resolve).toHaveBeenCalledWith('cloudflareService');
      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler: ChatJoinHandler');
      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler: ChatMessageHandler');
    });

    it('should throw if container already set', () => {
      manager.setContainer(mockContainer);

      expect(() => manager.setContainer(mockContainer)).toThrow('Container already set');
    });
  });

  describe('addClient', () => {
    it('should add client with default viewer type', () => {
      const ws = createMockWebSocket();

      const client = manager.addClient(ws);

      expect(client.clientId).toMatch(/^client_\d+_\d+$/);
      expect(client.socketType).toBe('viewer');
      expect(client.isAuthenticated).toBe(false);
      expect(client.lastActivity).toBeDefined();
      expect(manager.getClientCount()).toBe(1);
    });

    it('should add client with specified type', () => {
      const ws = createMockWebSocket();

      const client = manager.addClient(ws, 'admin', true);

      expect(client.socketType).toBe('admin');
      expect(client.isAuthenticated).toBe(true);
    });

    it('should increment client ID counter', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);

      expect(client1.clientId).not.toBe(client2.clientId);
    });

    it('should log client connection', () => {
      const ws = createMockWebSocket();

      manager.addClient(ws);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Client connected',
        expect.objectContaining({
          type: 'viewer',
        })
      );
    });
  });

  describe('removeClient', () => {
    it('should remove existing client', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);

      manager.removeClient(client);

      expect(manager.getClientCount()).toBe(0);
    });

    it('should do nothing for non-existent client', () => {
      const fakeClient = createMockWebSocket() as unknown as ExtendedWebSocket;

      // Should not throw
      expect(() => manager.removeClient(fakeClient)).not.toThrow();
    });

    it('should log client disconnection', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);

      manager.removeClient(client);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Client disconnected',
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
    });
  });

  describe('handleMessage', () => {
    it('should parse JSON message', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = JSON.stringify({ eventName: 'test' });

      // Should not throw
      expect(() => manager.handleMessage(client, message)).not.toThrow();
    });

    it('should handle Buffer messages', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = Buffer.from(JSON.stringify({ eventName: 'test' }));

      // Should not throw
      expect(() => manager.handleMessage(client, message)).not.toThrow();
    });

    it('should log warning for invalid JSON', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);

      manager.handleMessage(client, 'invalid json');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse WebSocket message',
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
    });

    it('should log warning for message without eventName', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = JSON.stringify({ data: 'test' });

      manager.handleMessage(client, message);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Message missing eventName',
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
    });

    it('should update client lastActivity', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const initialActivity = client.lastActivity;

      vi.advanceTimersByTime(1000);
      manager.handleMessage(client, JSON.stringify({ eventName: 'test' }));

      expect(client.lastActivity).toBeGreaterThan(initialActivity!);
    });

    it('should log debug when no handler found', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = JSON.stringify({ eventName: 'unknown_event' });

      manager.handleMessage(client, message);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No handler for message',
        expect.objectContaining({
          eventName: 'unknown_event',
        })
      );
    });
  });

  describe('broadcast', () => {
    it('should send message to all open clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      const message: WebSocketMessage = { eventName: 'broadcast_test' };

      manager.broadcast(message);

      expect(client1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(client2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should skip clients with non-open readyState', () => {
      const ws1 = createMockWebSocket({ readyState: 3 }); // CLOSED
      const client1 = manager.addClient(ws1);
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcast(message);

      expect(client1.send).not.toHaveBeenCalled();
    });

    it('should filter by videoId', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      (client1 as ExtendedWebSocket).videoId = 'video_1';
      (client2 as ExtendedWebSocket).videoId = 'video_2';
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcast(message, { videoId: 'video_1' });

      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).not.toHaveBeenCalled();
    });

    it('should filter by client types', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1, 'admin');
      const client2 = manager.addClient(ws2, 'viewer');
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcast(message, { clientTypes: ['admin'] });

      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).not.toHaveBeenCalled();
    });

    it('should exclude specific clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcast(message, { excludeClients: [client1.clientId!] });

      expect(client1.send).not.toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalled();
    });

    it('should log error on send failure', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Send failed');
      });
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcast(message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send message to client',
        expect.any(Error),
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
    });
  });

  describe('broadcastToVideo', () => {
    it('should broadcast to clients watching specific video', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      (client1 as ExtendedWebSocket).videoId = 'video_123';
      (client2 as ExtendedWebSocket).videoId = 'video_456';
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcastToVideo('video_123', message);

      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastToAdmins', () => {
    it('should broadcast to admin clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1, 'admin');
      const client2 = manager.addClient(ws2, 'viewer');
      const message: WebSocketMessage = { eventName: 'admin_message' };

      manager.broadcastToAdmins(message);

      expect(client1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(client2.send).not.toHaveBeenCalled();
    });

    it('should broadcast to authenticated clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1, 'viewer', true);
      const client2 = manager.addClient(ws2, 'viewer', false);
      const message: WebSocketMessage = { eventName: 'admin_message' };

      manager.broadcastToAdmins(message);

      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).not.toHaveBeenCalled();
    });

    it('should skip non-open clients', () => {
      const ws = createMockWebSocket({ readyState: 3 });
      const client = manager.addClient(ws, 'admin');
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcastToAdmins(message);

      expect(client.send).not.toHaveBeenCalled();
    });

    it('should log error on send failure', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws, 'admin');
      (client.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Send failed');
      });
      const message: WebSocketMessage = { eventName: 'test' };

      manager.broadcastToAdmins(message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send to admin',
        expect.any(Error)
      );
    });
  });

  describe('sendTo', () => {
    it('should send message to specific client', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message: WebSocketMessage = { eventName: 'direct_message' };

      manager.sendTo(client, message);

      expect(client.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send to non-open client', () => {
      const ws = createMockWebSocket({ readyState: 3 });
      const client = manager.addClient(ws);
      const message: WebSocketMessage = { eventName: 'test' };

      manager.sendTo(client, message);

      expect(client.send).not.toHaveBeenCalled();
    });

    it('should log error on send failure', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Send failed');
      });
      const message: WebSocketMessage = { eventName: 'test' };

      manager.sendTo(client, message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send message',
        expect.any(Error),
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
    });
  });

  describe('getLiveStreamWatchingCounts', () => {
    it('should return counts for node_peer clients by videoId', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();
      const client1 = manager.addClient(ws1, 'node_peer');
      const client2 = manager.addClient(ws2, 'node_peer');
      const client3 = manager.addClient(ws3, 'node_peer');
      (client1 as ExtendedWebSocket).videoId = 'video_1';
      (client2 as ExtendedWebSocket).videoId = 'video_1';
      (client3 as ExtendedWebSocket).videoId = 'video_2';

      const counts = manager.getLiveStreamWatchingCounts();

      expect(counts).toEqual({
        video_1: 2,
        video_2: 1,
      });
    });

    it('should return empty object when no node_peer clients', () => {
      const ws = createMockWebSocket();
      manager.addClient(ws, 'viewer');

      const counts = manager.getLiveStreamWatchingCounts();

      expect(counts).toEqual({});
    });

    it('should ignore node_peer clients without videoId', () => {
      const ws = createMockWebSocket();
      manager.addClient(ws, 'node_peer');

      const counts = manager.getLiveStreamWatchingCounts();

      expect(counts).toEqual({});
    });
  });

  describe('getClientCount', () => {
    it('should return correct client count', () => {
      expect(manager.getClientCount()).toBe(0);

      const ws1 = createMockWebSocket();
      manager.addClient(ws1);
      expect(manager.getClientCount()).toBe(1);

      const ws2 = createMockWebSocket();
      manager.addClient(ws2);
      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe('getClients', () => {
    it('should return set of all clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);

      const clients = manager.getClients();

      expect(clients.size).toBe(2);
      expect(clients.has(client1)).toBe(true);
      expect(clients.has(client2)).toBe(true);
    });
  });

  describe('closeAll', () => {
    it('should close all clients with default code and reason', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);

      manager.closeAll();

      expect(client1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(client2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(manager.getClientCount()).toBe(0);
    });

    it('should close all clients with custom code and reason', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);

      manager.closeAll(1000, 'Custom reason');

      expect(client.close).toHaveBeenCalledWith(1000, 'Custom reason');
    });

    it('should handle close errors gracefully', () => {
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client.close as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Close failed');
      });

      // Should not throw
      expect(() => manager.closeAll()).not.toThrow();
    });

    it('should stop heartbeat', () => {
      manager.startHeartbeat();
      manager.closeAll();

      // Heartbeat should be stopped - advance time and verify no activity
      vi.advanceTimersByTime(60000);
      // No error means heartbeat was stopped
    });
  });

  describe('startHeartbeat', () => {
    it('should start heartbeat timer', () => {
      manager.startHeartbeat();

      // Should not check immediately
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not start heartbeat if interval is 0', () => {
      const noHeartbeatManager = new WebSocketManager({
        logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
        heartbeatInterval: 0,
      });

      noHeartbeatManager.startHeartbeat();

      // Add stale client
      const ws = createMockWebSocket();
      const client = noHeartbeatManager.addClient(ws);
      (client as ExtendedWebSocket).lastActivity = Date.now() - 120000;

      vi.advanceTimersByTime(60000);

      // Should not have removed client
      expect(noHeartbeatManager.getClientCount()).toBe(1);
      noHeartbeatManager.closeAll();
    });
  });

  describe('stopHeartbeat', () => {
    it('should stop heartbeat timer', () => {
      manager.startHeartbeat();
      manager.stopHeartbeat();

      // Add stale client
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client as ExtendedWebSocket).lastActivity = Date.now() - 120000;

      vi.advanceTimersByTime(60000);

      // Client should not have been removed
      expect(manager.getClientCount()).toBe(1);
    });

    it('should handle stop when heartbeat not started', () => {
      // Should not throw
      expect(() => manager.stopHeartbeat()).not.toThrow();
    });
  });

  describe('checkClientHealth', () => {
    it('should remove stale clients', () => {
      manager.startHeartbeat();

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client as ExtendedWebSocket).lastActivity = Date.now() - 120000; // 2 minutes ago

      vi.advanceTimersByTime(30000); // Trigger heartbeat

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Removing stale client',
        expect.objectContaining({
          clientId: client.clientId,
        })
      );
      expect(client.close).toHaveBeenCalledWith(1000, 'Connection timeout');
    });

    it('should not remove active clients', () => {
      manager.startHeartbeat();

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client as ExtendedWebSocket).lastActivity = Date.now() - 10000; // 10 seconds ago

      vi.advanceTimersByTime(30000);

      expect(manager.getClientCount()).toBe(1);
    });

    it('should not remove clients without lastActivity', () => {
      manager.startHeartbeat();

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      (client as ExtendedWebSocket).lastActivity = undefined;

      vi.advanceTimersByTime(30000);

      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe('handler error handling', () => {
    it('should handle register with invalid JWT gracefully', () => {
      // The RegisterHandler catches JWT errors internally and logs them
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      
      // Send a register event with invalid JWT
      const message = JSON.stringify({ 
        eventName: 'register',
        socketType: 'admin',
        jwtToken: 'invalid-jwt-token'
      });

      // Should not throw
      expect(() => manager.handleMessage(client, message)).not.toThrow();
      
      // Client should be registered but not authenticated
      expect(client.socketType).toBe('admin');
      expect(client.isAuthenticated).toBe(false);
    });

    it('should handle chat message with chat disabled', () => {
      manager.setContainer(mockContainer);
      
      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      
      // Set up client as if they joined chat
      (client as ExtendedWebSocket).videoId = 'testvideo01';
      (client as ExtendedWebSocket).liveChatUsername = 'testuser';
      (client as ExtendedWebSocket).liveChatUsernameColorCode = 'ff0000';
      (client as ExtendedWebSocket).rateLimiter = {
        timestamps: [],
        rateLimitTimestamp: 0,
        rateLimitLevel: -1,
        isRateLimited: false,
      };

      // Send a chat message - this uses the ChatMessageHandler
      const message = JSON.stringify({ 
        eventName: 'chat',
        type: 'message',
        videoId: 'testvideo01',
        chatMessageContent: 'Hello world',
        sentTimestamp: Date.now(),
        cloudflareTurnstileToken: '',
      });

      // Should not throw
      expect(() => manager.handleMessage(client, message)).not.toThrow();
    });
  });

  describe('handler context', () => {
    it('should broadcast with videoId using context', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      
      // Set up clients with video IDs
      (client1 as ExtendedWebSocket).videoId = 'testvideo01';
      (client2 as ExtendedWebSocket).videoId = 'testvideo02';

      // Trigger a video status message that uses broadcastToAdmins
      (client1 as ExtendedWebSocket).socketType = 'admin';
      (client2 as ExtendedWebSocket).socketType = 'admin';
      
      const message = JSON.stringify({ 
        eventName: 'video_importing',
        videoId: 'testvideo01'
      });

      manager.handleMessage(client1, message);

      // Both admin clients should receive the broadcast
      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalled();
    });

    it('should use echo handler to broadcast with context.broadcast', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      
      // Set up client as admin for echo permissions
      (client1 as ExtendedWebSocket).socketType = 'admin';
      
      const message = JSON.stringify({ 
        eventName: 'echo',
        data: { 
          eventName: 'test_broadcast', 
          payload: { test: true } 
        }
      });

      manager.handleMessage(client1, message);

      // Both clients should receive the echo broadcast
      expect(client1.send).toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalled();
    });

    it('should broadcast with videoId using context.broadcast if branch', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      
      // Set up clients with different video IDs
      (client1 as ExtendedWebSocket).videoId = 'testvideo01';
      (client2 as ExtendedWebSocket).videoId = 'testvideo02';
      
      // Create a custom handler that explicitly calls context.broadcast WITH videoId
      const broadcastWithVideoHandler = {
        name: 'BroadcastWithVideoHandler',
        canHandle: (msg: { eventName: string }) => msg.eventName === 'broadcast_video',
        handle: (
          _client: import('@/types/websocket.js').ExtendedWebSocket,
          _message: import('@/types/websocket.js').IncomingWebSocketMessage,
          context: import('@websocket/handlers/base.js').HandlerContext
        ) => {
          // Call broadcast WITH videoId to trigger the if branch at line 459
          context.broadcast({ eventName: 'video_broadcasted_message' }, 'testvideo01');
        },
      };

      manager.registerHandler(broadcastWithVideoHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);
      
      const message = JSON.stringify({ eventName: 'broadcast_video' });

      manager.handleMessage(client1, message);

      // Only client1 should receive the broadcast (testvideo01)
      expect(client1.send).toHaveBeenCalledWith(JSON.stringify({ eventName: 'video_broadcasted_message' }));
      expect(client2.send).not.toHaveBeenCalled();
    });

    it('should broadcast without videoId using context.broadcast else branch', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const client1 = manager.addClient(ws1);
      const client2 = manager.addClient(ws2);
      
      // Create a custom handler that explicitly calls context.broadcast without videoId
      const broadcastHandler = {
        name: 'BroadcastHandler',
        canHandle: (msg: { eventName: string }) => msg.eventName === 'broadcast_all',
        handle: (
          _client: import('@/types/websocket.js').ExtendedWebSocket,
          _message: import('@/types/websocket.js').IncomingWebSocketMessage,
          context: import('@websocket/handlers/base.js').HandlerContext
        ) => {
          // Call broadcast WITHOUT videoId to trigger the else branch at line 459
          context.broadcast({ eventName: 'broadcasted_message' });
        },
      };

      manager.registerHandler(broadcastHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);
      
      const message = JSON.stringify({ eventName: 'broadcast_all' });

      manager.handleMessage(client1, message);

      // Both clients should receive the broadcast (no videoId filter)
      expect(client1.send).toHaveBeenCalledWith(JSON.stringify({ eventName: 'broadcasted_message' }));
      expect(client2.send).toHaveBeenCalledWith(JSON.stringify({ eventName: 'broadcasted_message' }));
    });
  });

  describe('handler sync/async error handling', () => {
    it('should catch and log synchronous handler errors', () => {
      // Create a custom handler that throws synchronously
      const throwingHandler = {
        name: 'ThrowingHandler',
        canHandle: (msg: { eventName: string }) => msg.eventName === 'throw_sync',
        handle: () => {
          throw new Error('Sync error from handler');
        },
      };

      // Register the throwing handler
      manager.registerHandler(throwingHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = JSON.stringify({ eventName: 'throw_sync' });

      // Should not throw - error should be caught
      expect(() => manager.handleMessage(client, message)).not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Handler ThrowingHandler sync error',
        expect.any(Error),
        { eventName: 'throw_sync' }
      );
    });

    it('should catch and log asynchronous handler errors', async () => {
      // Create a custom handler that returns a rejected promise
      const asyncThrowingHandler = {
        name: 'AsyncThrowingHandler',
        canHandle: (msg: { eventName: string }) => msg.eventName === 'throw_async',
        handle: () => Promise.reject(new Error('Async error from handler')),
      };

      manager.registerHandler(asyncThrowingHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      const message = JSON.stringify({ eventName: 'throw_async' });

      // Should not throw
      expect(() => manager.handleMessage(client, message)).not.toThrow();

      // Allow promise rejection to be handled
      await vi.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Handler AsyncThrowingHandler error',
        expect.any(Error),
        { eventName: 'throw_async' }
      );
    });
  });

  describe('handler lifecycle callbacks', () => {
    it('should call onConnect when client connects', () => {
      const onConnectHandler = {
        name: 'OnConnectHandler',
        canHandle: () => false,
        handle: vi.fn(),
        onConnect: vi.fn(),
      };

      manager.registerHandler(onConnectHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      manager.addClient(ws);

      expect(onConnectHandler.onConnect).toHaveBeenCalled();
    });

    it('should call onDisconnect when client disconnects', () => {
      const onDisconnectHandler = {
        name: 'OnDisconnectHandler',
        canHandle: () => false,
        handle: vi.fn(),
        onDisconnect: vi.fn(),
      };

      manager.registerHandler(onDisconnectHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      manager.removeClient(client);

      expect(onDisconnectHandler.onDisconnect).toHaveBeenCalled();
    });

    it('should catch and log onConnect errors', async () => {
      const errorOnConnectHandler = {
        name: 'ErrorOnConnectHandler',
        canHandle: () => false,
        handle: vi.fn(),
        onConnect: () => Promise.reject(new Error('onConnect failed')),
      };

      manager.registerHandler(errorOnConnectHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      manager.addClient(ws);

      // Allow promise rejection to be handled
      await vi.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Handler ErrorOnConnectHandler onConnect error',
        expect.any(Error)
      );
    });

    it('should catch and log onDisconnect errors', async () => {
      const errorOnDisconnectHandler = {
        name: 'ErrorOnDisconnectHandler',
        canHandle: () => false,
        handle: vi.fn(),
        onDisconnect: () => Promise.reject(new Error('onDisconnect failed')),
      };

      manager.registerHandler(errorOnDisconnectHandler as unknown as import('@websocket/handlers/base.js').WebSocketHandler);

      const ws = createMockWebSocket();
      const client = manager.addClient(ws);
      manager.removeClient(client);

      // Allow promise rejection to be handled
      await vi.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Handler ErrorOnDisconnectHandler onDisconnect error',
        expect.any(Error)
      );
    });
  });

  describe('service getter methods', () => {
    it('should throw when getting video service without container', () => {
      // Access the private method via prototype
      const managerWithoutContainer = new WebSocketManager({
        logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
      });

      // Create a handler that tries to access the video service
      expect(() => {
        // Force the manager to try registering service handlers without container
        // by accessing the private method directly
        (managerWithoutContainer as unknown as { getVideoService: () => void }).getVideoService();
      }).toThrow('Container not available');

      managerWithoutContainer.closeAll();
    });

    it('should throw when getting live chat service without container', () => {
      const managerWithoutContainer = new WebSocketManager({
        logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
      });

      expect(() => {
        (managerWithoutContainer as unknown as { getLiveChatService: () => void }).getLiveChatService();
      }).toThrow('Container not available');

      managerWithoutContainer.closeAll();
    });

    it('should throw when getting cloudflare service without container', () => {
      const managerWithoutContainer = new WebSocketManager({
        logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
      });

      expect(() => {
        (managerWithoutContainer as unknown as { getCloudflareService: () => void }).getCloudflareService();
      }).toThrow('Container not available');

      managerWithoutContainer.closeAll();
    });

    it('should return early in registerServiceHandlers when container is not set', () => {
      const managerWithoutContainer = new WebSocketManager({
        logger: mockLogger as unknown as WebSocketManagerOptions['logger'],
      });

      // Call registerServiceHandlers directly without setting container first
      // This should hit the early return at line 135
      const registerServiceHandlers = (managerWithoutContainer as unknown as { 
        registerServiceHandlers: () => void 
      }).registerServiceHandlers;
      
      // Should not throw, just return early
      expect(() => registerServiceHandlers.call(managerWithoutContainer)).not.toThrow();

      managerWithoutContainer.closeAll();
    });
  });
});
