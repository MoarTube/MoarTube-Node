import { describe, it, expect } from 'vitest';
import type {
  WebSocketEventName,
  WebSocketClientType,
  ExtendedWebSocket,
  WebSocketMessage,
  LiveStreamStatsMessage,
  ChatMessage,
  VideoStatusMessage,
  EchoMessage,
  BroadcastOptions,
  LiveStreamWatchingCounts,
} from '@/types/websocket.js';

describe('types/websocket.ts', () => {
  describe('WebSocketEventName type', () => {
    it('should accept all valid event names', () => {
      const events: WebSocketEventName[] = [
        'live_stream_stats',
        'live_stream_started',
        'live_stream_stopped',
        'chat_message',
        'chat_history',
        'joined',
        'message',
        'limited',
        'error',
        'video_status',
        'video_data',
        'video_importing',
        'video_imported',
        'video_publishing',
        'video_published',
        'video_error',
        'video_finalized',
        'node_name_update',
        'node_about_update',
        'registered',
        'echo',
      ];

      expect(events).toHaveLength(21);
      expect(events).toContain('live_stream_stats');
      expect(events).toContain('echo');
    });
  });

  describe('WebSocketClientType type', () => {
    it('should accept all valid client types', () => {
      const types: WebSocketClientType[] = [
        'node_peer',
        'admin',
        'viewer',
        'moartube_client',
      ];

      expect(types).toHaveLength(4);
      expect(types).toContain('admin');
      expect(types).toContain('viewer');
    });
  });

  describe('ExtendedWebSocket interface', () => {
    it('should create an ExtendedWebSocket-like object', () => {
      // Since we can't instantiate WebSocket directly, we test the extended properties
      const extendedProps = {
        socketType: 'viewer' as WebSocketClientType,
        videoId: 'test-video-id',
        isAuthenticated: true,
        clientId: 'client-123',
        lastActivity: Date.now(),
        liveChatUsername: 'TestUser',
        liveChatUsernameColorCode: '#FF0000',
        rateLimiter: {
          timestamps: [Date.now()],
          rateLimitTimestamp: Date.now(),
          rateLimitLevel: 1,
          isRateLimited: false,
        },
        ip: '127.0.0.1',
      };

      expect(extendedProps.socketType).toBe('viewer');
      expect(extendedProps.isAuthenticated).toBe(true);
      expect(extendedProps.liveChatUsername).toBe('TestUser');
    });
  });

  describe('WebSocket message types', () => {
    it('should create LiveStreamStatsMessage', () => {
      const message: LiveStreamStatsMessage = {
        eventName: 'live_stream_stats',
        watchingCount: 42,
      };

      expect(message.eventName).toBe('live_stream_stats');
      expect(message.watchingCount).toBe(42);
    });

    it('should create ChatMessage', () => {
      const message: ChatMessage = {
        eventName: 'chat_message',
        videoId: 'video-123',
        username: 'TestUser',
        usernameColorHexCode: '#FF0000',
        chatMessage: 'Hello world!',
        timestamp: Date.now(),
      };

      expect(message.eventName).toBe('chat_message');
      expect(message.videoId).toBe('video-123');
      expect(message.chatMessage).toBe('Hello world!');
    });

    it('should create VideoStatusMessage', () => {
      const message: VideoStatusMessage = {
        eventName: 'video_status',
        videoId: 'video-123',
        status: 'published',
      };

      expect(message.eventName).toBe('video_status');
      expect(message.status).toBe('published');
    });

    it('should create EchoMessage', () => {
      const message: EchoMessage = {
        eventName: 'echo',
        data: {
          eventName: 'custom_event',
          payload: { key: 'value' },
        },
      };

      expect(message.eventName).toBe('echo');
      expect(message.data.eventName).toBe('custom_event');
      expect(message.data.payload).toEqual({ key: 'value' });
    });

    it('should handle WebSocketMessage union type', () => {
      const messages: WebSocketMessage[] = [
        { eventName: 'live_stream_stats', watchingCount: 10 },
        { eventName: 'video_status', videoId: 'vid-1', status: 'published' },
        { eventName: 'echo', data: { eventName: 'test', payload: {} } },
      ];

      expect(messages).toHaveLength(3);
      expect(messages[0].eventName).toBe('live_stream_stats');
      expect(messages[1].eventName).toBe('video_status');
      expect(messages[2].eventName).toBe('echo');
    });
  });

  describe('BroadcastOptions interface', () => {
    it('should create broadcast options', () => {
      const options: BroadcastOptions = {
        videoId: 'video-123',
        clientTypes: ['viewer', 'admin'],
        excludeClients: ['client-456'],
      };

      expect(options.videoId).toBe('video-123');
      expect(options.clientTypes).toEqual(['viewer', 'admin']);
      expect(options.excludeClients).toEqual(['client-456']);
    });

    it('should handle optional properties', () => {
      const options: BroadcastOptions = {};

      expect(options.videoId).toBeUndefined();
      expect(options.clientTypes).toBeUndefined();
      expect(options.excludeClients).toBeUndefined();
    });
  });

  describe('LiveStreamWatchingCounts interface', () => {
    it('should create watching counts object', () => {
      const counts: LiveStreamWatchingCounts = {
        'video-1': 25,
        'video-2': 10,
        'video-3': 5,
      };

      expect(counts['video-1']).toBe(25);
      expect(counts['video-2']).toBe(10);
      expect(counts['video-3']).toBe(5);
    });
  });
});