/**
 * Unit tests for database/repositories/reports-archive-comments.ts
 *
 * Tests the ReportsArchiveCommentsRepository class for archived comment report CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReportsArchiveCommentsRepository } from '@database/repositories/reports-archive-comments.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/reports-archive-comments.ts', () => {
  let mockDb: any;
  let mockArchiveTable: any;
  let repository: ReportsArchiveCommentsRepository;

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

    mockArchiveTable = {
      archive_id: { name: 'archive_id' },
      video_id: { name: 'video_id' },
      comment_id: { name: 'comment_id' },
      timestamp: { name: 'timestamp' },
    };

    repository = new ReportsArchiveCommentsRepository(mockDb, mockArchiveTable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find archive by id', async () => {
      const mockArchive = { archive_id: 1 };
      mockDb.limit.mockResolvedValue([mockArchive]);

      const result = await repository.findById(1);

      expect(result).toEqual(mockArchive);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all archives without limit', async () => {
      const mockArchives = [{ archive_id: 1 }];
      mockDb.orderBy.mockResolvedValue(mockArchives);

      const result = await repository.findAll();

      expect(result).toEqual(mockArchives);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findByVideoId', () => {
    it('should find archives by video id', async () => {
      const mockArchives = [{ archive_id: 1 }];
      mockDb.limit.mockResolvedValue(mockArchives);

      const result = await repository.findByVideoId('v1');

      expect(mockDb.limit).toHaveBeenCalledWith(20);
      expect(result).toEqual(mockArchives);
    });
  });

  describe('findByCommentId', () => {
    it('should find archives by comment id', async () => {
      const mockArchives = [{ archive_id: 1 }];
      mockDb.limit.mockResolvedValue(mockArchives);

      const result = await repository.findByCommentId(1);

      expect(result).toEqual(mockArchives);
    });
  });

  describe('findByReportId', () => {
    it('should find archive by report id', async () => {
      const mockArchive = { archive_id: 1, report_id: 5 };
      mockDb.limit.mockResolvedValue([mockArchive]);

      const result = await repository.findByReportId(5);

      expect(result).toEqual(mockArchive);
    });

    it('should return null when report id not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByReportId(999);

      expect(result).toBeNull();
    });
  });

  describe('getCount', () => {
    it('should return count of archives', async () => {
      mockDb.from.mockResolvedValue([{ count: 25 }]);

      const result = await repository.getCount();

      expect(result).toBe(25);
    });

    it('should return 0 when no archives', async () => {
      mockDb.from.mockResolvedValue([{}]);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('should create an archive record', async () => {
      const archiveData = { video_id: 'v1', comment_id: 1 };
      const created = { archive_id: 1, ...archiveData };
      mockDb.returning.mockResolvedValue([created]);

      const result = await repository.create(archiveData);

      expect(result).toEqual(created);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ video_id: 'v1' })).rejects.toThrow(
        'Failed to create comment report archive record'
      );
    });
  });

  describe('delete', () => {
    it('should delete archive by id', async () => {
      mockDb.returning.mockResolvedValue([{ archive_id: 1 }]);

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when archive not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('deleteByVideoId', () => {
    it('should delete all archives for video', async () => {
      mockDb.returning.mockResolvedValue([{}, {}]);

      const result = await repository.deleteByVideoId('v1');

      expect(result).toBe(2);
    });
  });

  describe('deleteByCommentId', () => {
    it('should delete all archives for comment', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}]);

      const result = await repository.deleteByCommentId(1);

      expect(result).toBe(3);
    });
  });

  describe('deleteAll', () => {
    it('should delete all archives and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}, {}]);

      const result = await repository.deleteAll();

      expect(result).toBe(4);
    });
  });

  describe('createMany', () => {
    it('should create multiple archives', async () => {
      const archivesData = [{ video_id: 'v1' }, { video_id: 'v2' }];
      const created = [{ archive_id: 1 }, { archive_id: 2 }];
      mockDb.returning.mockResolvedValue(created);

      const result = await repository.createMany(archivesData);

      expect(result).toEqual(created);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
