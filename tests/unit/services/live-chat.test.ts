/**
 * Live Chat Service Tests
 *
 * Tests for the LiveChatService class that handles live chat message operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveChatService } from '@/services/live-chat.js';
import type { Logger } from '@/utils/logger.js';
import type { LiveChatMessagesRepository } from '@/database/repositories/index.js';
import type { DrizzleLiveChatMessage } from '@/database/schemas/sqlite/index.js';

describe('LiveChatService', () => {
  let service: LiveChatService;
  let mockLogger: Logger;
  let mockLiveChatRepository: LiveChatMessagesRepository;

  const mockMessage: DrizzleLiveChatMessage = {
    id: 1,
    video_id: 'video123',
    username: 'user1',
    username_color_hex_code: '#ff0000',
    chat_message: 'Hello chat!',
    timestamp: 1704067200000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockLiveChatRepository = {
      findRecentByVideoId: vi.fn(),
      findAfterTimestamp: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteByVideoId: vi.fn(),
      pruneOldMessages: vi.fn(),
      countByVideoId: vi.fn(),
    } as unknown as LiveChatMessagesRepository;

    service = new LiveChatService(mockLogger, mockLiveChatRepository);
  });

  describe('constructor', () => {
    it('should create a LiveChatService instance', () => {
      expect(service).toBeInstanceOf(LiveChatService);
    });
  });

  describe('getRecentMessages', () => {
    it('should return recent messages for a video', async () => {
      const mockMessages: DrizzleLiveChatMessage[] = [
        mockMessage,
        { ...mockMessage, id: 2, chat_message: 'Second message' },
      ];
      vi.mocked(mockLiveChatRepository.findRecentByVideoId).mockResolvedValue(mockMessages);

      const result = await service.getRecentMessages('video123');

      expect(result).toEqual(mockMessages);
      expect(mockLiveChatRepository.findRecentByVideoId).toHaveBeenCalledWith(
        'video123',
        undefined
      );
    });

    it('should accept optional count parameter', async () => {
      vi.mocked(mockLiveChatRepository.findRecentByVideoId).mockResolvedValue([mockMessage]);

      await service.getRecentMessages('video123', 10);

      expect(mockLiveChatRepository.findRecentByVideoId).toHaveBeenCalledWith('video123', 10);
    });

    it('should return empty array when no messages exist', async () => {
      vi.mocked(mockLiveChatRepository.findRecentByVideoId).mockResolvedValue([]);

      const result = await service.getRecentMessages('video123');

      expect(result).toEqual([]);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockLiveChatRepository.findRecentByVideoId).mockRejectedValue(error);

      await expect(service.getRecentMessages('video123')).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('getRecentMessages failed', error);
    });
  });

  describe('getMessagesAfter', () => {
    it('should return messages after a timestamp', async () => {
      const mockMessages = [mockMessage];
      vi.mocked(mockLiveChatRepository.findAfterTimestamp).mockResolvedValue(mockMessages);

      const result = await service.getMessagesAfter('video123', 1704067100000);

      expect(result).toEqual(mockMessages);
      expect(mockLiveChatRepository.findAfterTimestamp).toHaveBeenCalledWith(
        'video123',
        1704067100000,
        undefined
      );
    });

    it('should accept optional limit parameter', async () => {
      vi.mocked(mockLiveChatRepository.findAfterTimestamp).mockResolvedValue([]);

      await service.getMessagesAfter('video123', 1704067100000, 50);

      expect(mockLiveChatRepository.findAfterTimestamp).toHaveBeenCalledWith(
        'video123',
        1704067100000,
        50
      );
    });

    it('should return empty array when no new messages', async () => {
      vi.mocked(mockLiveChatRepository.findAfterTimestamp).mockResolvedValue([]);

      const result = await service.getMessagesAfter('video123', Date.now());

      expect(result).toEqual([]);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockLiveChatRepository.findAfterTimestamp).mockRejectedValue(error);

      await expect(service.getMessagesAfter('video123', 1704067100000)).rejects.toThrow(
        'Database error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('getMessagesAfter failed', error);
    });
  });

  describe('createMessage', () => {
    it('should create a new chat message', async () => {
      vi.mocked(mockLiveChatRepository.create).mockResolvedValue(mockMessage);

      const result = await service.createMessage({
        videoId: 'video123',
        username: 'user1',
        usernameColorHexCode: '#ff0000',
        chatMessage: 'Hello chat!',
      });

      expect(result).toEqual(mockMessage);
      expect(mockLiveChatRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          video_id: 'video123',
          username: 'user1',
          username_color_hex_code: '#ff0000',
          chat_message: 'Hello chat!',
        })
      );
    });

    it('should set timestamp on new message', async () => {
      vi.mocked(mockLiveChatRepository.create).mockImplementation(async (data) => ({
        id: 1,
        video_id: data.video_id,
        username: data.username,
        username_color_hex_code: data.username_color_hex_code,
        chat_message: data.chat_message,
        timestamp: data.timestamp,
      }));

      const beforeTime = Date.now();
      await service.createMessage({
        videoId: 'video123',
        username: 'user1',
        usernameColorHexCode: '#ff0000',
        chatMessage: 'Test',
      });
      const afterTime = Date.now();

      const createCall = vi.mocked(mockLiveChatRepository.create).mock.calls[0]!;
      expect(createCall[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(createCall[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Create failed');
      vi.mocked(mockLiveChatRepository.create).mockRejectedValue(error);

      await expect(
        service.createMessage({
          videoId: 'video123',
          username: 'user1',
          usernameColorHexCode: '#ff0000',
          chatMessage: 'Test',
        })
      ).rejects.toThrow('Create failed');
      expect(mockLogger.error).toHaveBeenCalledWith('createMessage failed', error);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message by ID', async () => {
      vi.mocked(mockLiveChatRepository.delete).mockResolvedValue(true);

      const result = await service.deleteMessage(1);

      expect(result).toBe(true);
      expect(mockLiveChatRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should return false if message not found', async () => {
      vi.mocked(mockLiveChatRepository.delete).mockResolvedValue(false);

      const result = await service.deleteMessage(999);

      expect(result).toBe(false);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockLiveChatRepository.delete).mockRejectedValue(error);

      await expect(service.deleteMessage(1)).rejects.toThrow('Delete failed');
      expect(mockLogger.error).toHaveBeenCalledWith('deleteMessage failed', error);
    });
  });

  describe('deleteMessagesForVideo', () => {
    it('should delete all messages for a video', async () => {
      vi.mocked(mockLiveChatRepository.deleteByVideoId).mockResolvedValue(25);

      const result = await service.deleteMessagesForVideo('video123');

      expect(result).toBe(25);
      expect(mockLiveChatRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
    });

    it('should return 0 if no messages to delete', async () => {
      vi.mocked(mockLiveChatRepository.deleteByVideoId).mockResolvedValue(0);

      const result = await service.deleteMessagesForVideo('video123');

      expect(result).toBe(0);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockLiveChatRepository.deleteByVideoId).mockRejectedValue(error);

      await expect(service.deleteMessagesForVideo('video123')).rejects.toThrow('Delete failed');
      expect(mockLogger.error).toHaveBeenCalledWith('deleteMessagesForVideo failed', error);
    });
  });

  describe('pruneOldMessages', () => {
    it('should prune old messages keeping specified count', async () => {
      vi.mocked(mockLiveChatRepository.pruneOldMessages).mockResolvedValue(50);

      const result = await service.pruneOldMessages('video123', 100);

      expect(result).toBe(50);
      expect(mockLiveChatRepository.pruneOldMessages).toHaveBeenCalledWith('video123', 100);
    });

    it('should return 0 if nothing to prune', async () => {
      vi.mocked(mockLiveChatRepository.pruneOldMessages).mockResolvedValue(0);

      const result = await service.pruneOldMessages('video123', 100);

      expect(result).toBe(0);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Prune failed');
      vi.mocked(mockLiveChatRepository.pruneOldMessages).mockRejectedValue(error);

      await expect(service.pruneOldMessages('video123', 100)).rejects.toThrow('Prune failed');
      expect(mockLogger.error).toHaveBeenCalledWith('pruneOldMessages failed', error);
    });
  });

  describe('countMessagesForVideo', () => {
    it('should return message count for a video', async () => {
      vi.mocked(mockLiveChatRepository.countByVideoId).mockResolvedValue(150);

      const result = await service.countMessagesForVideo('video123');

      expect(result).toBe(150);
      expect(mockLiveChatRepository.countByVideoId).toHaveBeenCalledWith('video123');
    });

    it('should return 0 for videos with no messages', async () => {
      vi.mocked(mockLiveChatRepository.countByVideoId).mockResolvedValue(0);

      const result = await service.countMessagesForVideo('video123');

      expect(result).toBe(0);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Count failed');
      vi.mocked(mockLiveChatRepository.countByVideoId).mockRejectedValue(error);

      await expect(service.countMessagesForVideo('video123')).rejects.toThrow('Count failed');
      expect(mockLogger.error).toHaveBeenCalledWith('countMessagesForVideo failed', error);
    });
  });
});
