/**
 * Unit tests for database/repositories/live-chat-messages.ts
 *
 * Tests the LiveChatMessagesRepository interface implementations for live chat message CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLiveChatMessagesRepository, type ILiveChatMessagesRepository } from '@database/repositories/live-chat-messages/index.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  gte: vi.fn((field, value) => ({ type: 'gte', field, value })),
  lt: vi.fn((field, value) => ({ type: 'lt', field, value })),
  asc: vi.fn((field) => ({ type: 'asc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/live-chat-messages.ts', () => {
  let mockDb: any;
  let repository: ILiveChatMessagesRepository<any, any>;

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockReturnThis(),
    };

    // Create repository using factory function
    repository = createLiveChatMessagesRepository('sqlite', mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find message by id', async () => {
      const mockMessage = { chat_message_id: 1 };
      mockDb.limit.mockResolvedValue([mockMessage]);

      const result = await repository.findById(1);

      expect(result).toEqual(mockMessage);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByVideoId', () => {
    it('should find messages by video id with default limit', async () => {
      const mockMessages = [{ chat_message_id: 1 }];
      mockDb.limit.mockResolvedValue(mockMessages);

      const result = await repository.findByVideoId('v1');

      expect(mockDb.limit).toHaveBeenCalledWith(20);
      expect(result).toEqual(mockMessages);
    });

    it('should apply custom limit', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findByVideoId('v1', { limit: 50 });

      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('findRecentByVideoId', () => {
    it('should find recent messages and reverse order', async () => {
      const mockMessages = [{ id: 1 }, { id: 2 }, { id: 3 }];
      mockDb.limit.mockResolvedValue(mockMessages);

      const result = await repository.findRecentByVideoId('v1', 3);

      expect(mockDb.limit).toHaveBeenCalledWith(3);
      expect(result).toEqual([{ id: 3 }, { id: 2 }, { id: 1 }]);
    });

    it('should use default count of 50', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findRecentByVideoId('v1');

      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('findAfterTimestamp', () => {
    it('should find messages after timestamp', async () => {
      const mockMessages = [{ chat_message_id: 1 }];
      mockDb.limit.mockResolvedValue(mockMessages);

      const result = await repository.findAfterTimestamp('v1', 12345, 50);

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(mockMessages);
    });

    it('should use default limit of 100', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAfterTimestamp('v1', 12345);

      expect(mockDb.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('countByVideoId', () => {
    it('should return count of messages for video', async () => {
      mockDb.where.mockResolvedValue([{ count: 25 }]);

      const result = await repository.countByVideoId('v1');

      expect(result).toBe(25);
    });

    it('should return 0 when no messages', async () => {
      mockDb.where.mockResolvedValue([{}]);

      const result = await repository.countByVideoId('v1');

      expect(result).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return all messages without limit', async () => {
      const mockMessages = [{ chat_message_id: 1 }];
      mockDb.from.mockResolvedValue(mockMessages);

      const result = await repository.findAll();

      expect(result).toEqual(mockMessages);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('create', () => {
    it('should create a message record', async () => {
      const messageData = { video_id: 'v1', message: 'Hello' };
      const created = { chat_message_id: 1, ...messageData };
      mockDb.returning.mockResolvedValue([created]);

      const result = await repository.create(messageData);

      expect(result).toEqual(created);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ video_id: 'v1' })).rejects.toThrow(
        'Failed to create live chat message record'
      );
    });
  });

  describe('delete', () => {
    it('should delete message by id', async () => {
      mockDb.returning.mockResolvedValue([{ chat_message_id: 1 }]);

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when message not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('deleteByVideoId', () => {
    it('should delete all messages for video', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}]);

      const result = await repository.deleteByVideoId('v1');

      expect(result).toBe(3);
    });
  });

  describe('deleteAll', () => {
    it('should delete all messages and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}, {}, {}]);

      const result = await repository.deleteAll();

      expect(result).toBe(5);
    });
  });

  describe('pruneOldMessages', () => {
    it('should return 0 when not enough messages to prune', async () => {
      // Less messages than keepCount
      mockDb.limit.mockResolvedValue([{ timestamp: 100 }]);

      const result = await repository.pruneOldMessages('v1', 5);

      expect(result).toBe(0);
    });

    it('should return 0 when no messages found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.pruneOldMessages('v1', 5);

      expect(result).toBe(0);
    });

    it('should delete old messages when enough messages exist', async () => {
      // First call returns messages with timestamps
      mockDb.limit.mockResolvedValueOnce([
        { timestamp: 100 },
        { timestamp: 200 },
        { timestamp: 300 },
      ]);
      // Second call (delete) returns deleted count
      mockDb.returning.mockResolvedValue([{}, {}]);

      const result = await repository.pruneOldMessages('v1', 3);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toBe(2);
    });
  });

  describe('createMany', () => {
    it('should create multiple messages', async () => {
      const messagesData = [{ video_id: 'v1' }, { video_id: 'v1' }];
      const created = [{ chat_message_id: 1 }, { chat_message_id: 2 }];
      mockDb.returning.mockResolvedValue(created);

      const result = await repository.createMany(messagesData);

      expect(result).toEqual(created);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
