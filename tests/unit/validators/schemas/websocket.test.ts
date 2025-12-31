import { describe, it, expect } from 'vitest';
import {
  chatMessageContentSchema,
  chatJoinEventSchema,
  chatMessageEventSchema,
  registerEventSchema,
  echoEventSchema,
  videoStatusEventSchema,
  type ChatJoinEvent,
  type ChatMessageEvent,
  type VideoStatusEvent,
  type RegisterEvent,
  type EchoEvent,
} from '@/validators/schemas/websocket.js';

describe('validators/schemas/websocket.ts', () => {
  describe('chatMessageContentSchema', () => {
    it('should validate valid chat message content', () => {
      expect(chatMessageContentSchema.parse('Hello world!')).toBe('Hello world!');
      expect(chatMessageContentSchema.parse('A')).toBe('A');
      expect(chatMessageContentSchema.parse('Message with spaces')).toBe('Message with spaces');
    });

    it('should trim whitespace', () => {
      expect(chatMessageContentSchema.parse('  Hello world!  ')).toBe('Hello world!');
      expect(chatMessageContentSchema.parse('\tMessage\t')).toBe('Message');
    });

    it('should reject empty messages', () => {
      expect(() => chatMessageContentSchema.parse('')).toThrow('Message cannot be empty');
      expect(() => chatMessageContentSchema.parse('   ')).toThrow('Message cannot be empty after trimming');
    });

    it('should reject overly long messages', () => {
      const longMessage = 'x'.repeat(501);
      expect(() => chatMessageContentSchema.parse(longMessage)).toThrow('Message must be less than 500 characters');
    });
  });

  describe('chatJoinEventSchema', () => {
    it('should validate valid chat join events', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'join' as const,
        videoId: 'dQw4w9WgXcQ',
      };

      expect(chatJoinEventSchema.parse(event)).toEqual(event);
    });

    it('should reject invalid event names', () => {
      const event = {
        eventName: 'invalid',
        type: 'join' as const,
        videoId: 'dQw4w9WgXcQ',
      };

      expect(() => chatJoinEventSchema.parse(event)).toThrow();
    });

    it('should reject invalid types', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'invalid',
        videoId: 'dQw4w9WgXcQ',
      };

      expect(() => chatJoinEventSchema.parse(event)).toThrow();
    });

    it('should reject invalid video IDs', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'join' as const,
        videoId: 'invalid',
      };

      expect(() => chatJoinEventSchema.parse(event)).toThrow('Invalid video ID format');
    });
  });

  describe('chatMessageEventSchema', () => {
    it('should validate valid chat message events', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'message' as const,
        videoId: 'dQw4w9WgXcQ',
        chatMessageContent: 'Hello world!',
        sentTimestamp: 1640995200000,
        cloudflareTurnstileToken: 'token123',
      };

      expect(chatMessageEventSchema.parse(event)).toEqual(event);
    });

    it('should trim chat message content', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'message' as const,
        videoId: 'dQw4w9WgXcQ',
        chatMessageContent: '  Hello world!  ',
        sentTimestamp: 1640995200000,
        cloudflareTurnstileToken: 'token123',
      };

      const result = chatMessageEventSchema.parse(event);
      expect(result.chatMessageContent).toBe('Hello world!');
    });

    it('should reject invalid timestamps', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'message' as const,
        videoId: 'dQw4w9WgXcQ',
        chatMessageContent: 'Hello world!',
        sentTimestamp: -1,
        cloudflareTurnstileToken: 'token123',
      };

      expect(() => chatMessageEventSchema.parse(event)).toThrow();
    });

    it('should accept empty cloudflare token', () => {
      const event = {
        eventName: 'chat' as const,
        type: 'message' as const,
        videoId: 'dQw4w9WgXcQ',
        chatMessageContent: 'Hello world!',
        sentTimestamp: 1640995200000,
        cloudflareTurnstileToken: '',
      };

      expect(chatMessageEventSchema.parse(event)).toEqual(event);
    });
  });

  describe('registerEventSchema', () => {
    it('should validate valid register events with JWT', () => {
      const event = {
        eventName: 'register' as const,
        socketType: 'admin' as const,
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      };

      expect(registerEventSchema.parse(event)).toEqual(event);
    });

    it('should validate register events without JWT', () => {
      const event = {
        eventName: 'register' as const,
        socketType: 'viewer' as const,
      };

      const result = registerEventSchema.parse(event);
      expect(result.socketType).toBe('viewer');
      expect(result.jwtToken).toBeUndefined();
    });

    it('should validate all socket types', () => {
      const socketTypes = ['moartube_client', 'admin', 'viewer', 'node_peer'] as const;

      socketTypes.forEach(socketType => {
        const event = {
          eventName: 'register' as const,
          socketType,
        };

        expect(registerEventSchema.parse(event).socketType).toBe(socketType);
      });
    });

    it('should reject invalid socket types', () => {
      const event = {
        eventName: 'register' as const,
        socketType: 'invalid_type',
      };

      expect(() => registerEventSchema.parse(event)).toThrow();
    });
  });

  describe('echoEventSchema', () => {
    it('should validate valid echo events', () => {
      const event = {
        eventName: 'echo' as const,
        data: {
          eventName: 'custom_event',
          payload: { key: 'value', number: 42 },
        },
      };

      expect(echoEventSchema.parse(event)).toEqual(event);
    });

    it('should accept any payload type', () => {
      const payloads = [
        'string payload',
        123,
        { object: 'payload' },
        ['array', 'payload'],
        null,
        undefined,
      ];

      payloads.forEach(payload => {
        const event = {
          eventName: 'echo' as const,
          data: {
            eventName: 'test',
            payload,
          },
        };

        expect(echoEventSchema.parse(event).data.payload).toBe(payload);
      });
    });

    it('should reject empty event names', () => {
      const event = {
        eventName: 'echo' as const,
        data: {
          eventName: '',
          payload: {},
        },
      };

      expect(() => echoEventSchema.parse(event)).toThrow();
    });
  });

  describe('videoStatusEventSchema', () => {
    it('should validate valid video status events with videoId', () => {
      const event = {
        eventName: 'video_status' as const,
        videoId: 'dQw4w9WgXcQ',
      };

      expect(videoStatusEventSchema.parse(event)).toEqual(event);
    });

    it('should validate video status events without videoId', () => {
      const event = {
        eventName: 'video_published' as const,
      };

      const result = videoStatusEventSchema.parse(event);
      expect(result.eventName).toBe('video_published');
      expect(result.videoId).toBeUndefined();
    });

    it('should validate all video status event names', () => {
      const eventNames = [
        'video_importing',
        'video_imported',
        'video_publishing',
        'video_published',
        'video_error',
        'video_finalized',
        'video_status',
        'video_data',
      ] as const;

      eventNames.forEach(eventName => {
        const event = { eventName };
        expect(videoStatusEventSchema.parse(event).eventName).toBe(eventName);
      });
    });

    it('should reject invalid event names', () => {
      const event = {
        eventName: 'invalid_status',
        videoId: 'dQw4w9WgXcQ',
      };

      expect(() => videoStatusEventSchema.parse(event)).toThrow();
    });
  });

  describe('Type exports', () => {
    it('should export ChatJoinEvent type', () => {
      const event: ChatJoinEvent = {
        eventName: 'chat',
        type: 'join',
        videoId: 'dQw4w9WgXcQ',
      };

      expect(event.eventName).toBe('chat');
      expect(event.type).toBe('join');
    });

    it('should export ChatMessageEvent type', () => {
      const event: ChatMessageEvent = {
        eventName: 'chat',
        type: 'message',
        videoId: 'dQw4w9WgXcQ',
        chatMessageContent: 'Hello!',
        sentTimestamp: 1640995200000,
        cloudflareTurnstileToken: 'token',
      };

      expect(event.chatMessageContent).toBe('Hello!');
    });

    it('should export VideoStatusEvent type', () => {
      const event: VideoStatusEvent = {
        eventName: 'video_status',
        videoId: 'dQw4w9WgXcQ',
      };

      expect(event.eventName).toBe('video_status');
    });

    it('should export RegisterEvent type', () => {
      const event: RegisterEvent = {
        eventName: 'register',
        socketType: 'admin',
        jwtToken: 'token123',
      };

      expect(event.socketType).toBe('admin');
    });

    it('should export EchoEvent type', () => {
      const event: EchoEvent = {
        eventName: 'echo',
        data: {
          eventName: 'test',
          payload: { data: 'test' },
        },
      };

      expect(event.data.eventName).toBe('test');
    });
  });
});