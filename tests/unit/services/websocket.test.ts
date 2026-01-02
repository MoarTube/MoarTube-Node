/**
 * WebSocket Service Tests
 *
 * Tests for the WebSocketService class that handles real-time communication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService } from '@/services/websocket.js';
import type { Logger } from '@/utils/logger.js';
import type { WebSocketMessage } from '@/services/interfaces.js';

describe('WebSocketService', () => {
  let service: WebSocketService;
  let mockLogger: Logger;
  let originalProcessSend: typeof process.send;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    // Store original process.send
    originalProcessSend = process.send;

    service = new WebSocketService(mockLogger);
  });

  afterEach(() => {
    // Restore process.send
    process.send = originalProcessSend;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a WebSocketService instance', () => {
      expect(service).toBeInstanceOf(WebSocketService);
    });
  });

  describe('broadcastToNodes', () => {
    it('should send message to master process in cluster mode', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      const message: WebSocketMessage = {
        eventName: 'test_event',
        data: { foo: 'bar' },
      };

      service.broadcastToNodes(message);

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message,
      });
    });

    it('should log debug message in non-cluster mode', () => {
      process.send = undefined;

      const message: WebSocketMessage = {
        eventName: 'test_event',
        data: { foo: 'bar' },
      };

      service.broadcastToNodes(message);

      expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket broadcast (non-cluster mode)', {
        cmd: 'websocket_broadcast',
      });
    });
  });

  describe('broadcastToChat', () => {
    it('should send chat message to master process', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      const message: WebSocketMessage = {
        eventName: 'chat_message',
        data: { text: 'Hello' },
      };

      service.broadcastToChat('video123', message);

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast_chat',
        videoId: 'video123',
        message,
      });
    });
  });

  describe('broadcastToAll', () => {
    it('should broadcast to nodes', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      const message: WebSocketMessage = {
        eventName: 'global_event',
        data: { info: 'broadcast' },
      };

      service.broadcastToAll(message);

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('Broadcasting to all clients', {
        eventName: 'global_event',
      });
    });
  });

  describe('sendToClient', () => {
    it('should send message to specific client', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      const message: WebSocketMessage = {
        eventName: 'private_message',
        data: { text: 'Hello' },
      };

      service.sendToClient('client123', message);

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_send_to_client',
        clientId: 'client123',
        message,
      });
    });
  });

  describe('getConnectedCount', () => {
    it('should return connected count', () => {
      const result = service.getConnectedCount();

      expect(typeof result).toBe('number');
      expect(result).toBe(0); // Default is 0
    });
  });

  describe('getChatClientCount', () => {
    it('should return 0 for unknown video', () => {
      const result = service.getChatClientCount('video123');

      expect(result).toBe(0);
    });
  });

  describe('broadcastVideoData', () => {
    it('should broadcast video data update', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastVideoData('video123', { title: 'Updated Title' });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'video_data',
          videoId: 'video123',
          data: { title: 'Updated Title' },
        },
      });
    });
  });

  describe('broadcastVideoStatus', () => {
    it('should broadcast video status update', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastVideoStatus('video123', { isStreaming: true });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'video_status',
          videoId: 'video123',
          data: { isStreaming: true },
        },
      });
    });
  });

  describe('broadcastVideoPublish', () => {
    it('should broadcast video publish event', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastVideoPublish('video123', { progress: 50 });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'video_publish',
          videoId: 'video123',
          data: { progress: 50 },
        },
      });
    });
  });

  describe('broadcastChatMessage', () => {
    it('should broadcast chat message to video chat room', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastChatMessage('video123', 'User1', '#FF0000', 'Hello everyone!', 1700000000000);

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast_chat',
        videoId: 'video123',
        message: {
          eventName: 'chat_message',
          videoId: 'video123',
          data: {
            username: 'User1',
            usernameColorHexCode: '#FF0000',
            chatMessage: 'Hello everyone!',
            timestamp: 1700000000000,
          },
        },
      });
    });
  });

  describe('broadcastLiveStreamStats', () => {
    it('should broadcast live stream stats', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastLiveStreamStats('video123', { viewers: 100, uptime: 3600 });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'live_stream_stats',
          videoId: 'video123',
          data: { viewers: 100, uptime: 3600 },
        },
      });
    });
  });

  describe('broadcastNodeNameUpdate', () => {
    it('should broadcast node name update', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastNodeNameUpdate('New Node Name');

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'node_name_update',
          data: { nodeName: 'New Node Name' },
        },
      });
    });
  });

  describe('broadcastNodeAboutUpdate', () => {
    it('should broadcast node about update', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastNodeAboutUpdate('New about text');

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'node_about_update',
          data: { nodeAbout: 'New about text' },
        },
      });
    });
  });

  describe('broadcastNodeSettingsUpdate', () => {
    it('should broadcast node settings update', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.broadcastNodeSettingsUpdate({ isSecure: true, port: 443 });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'node_settings_update',
          data: { isSecure: true, port: 443 },
        },
      });
    });
  });

  describe('echo', () => {
    it('should send echo message with wrapped event', () => {
      const mockSend = vi.fn();
      process.send = mockSend;

      service.echo('video_status', { isLive: true });

      expect(mockSend).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'echo',
          data: {
            eventName: 'video_status',
            payload: { isLive: true },
          },
        },
      });
    });
  });
});
