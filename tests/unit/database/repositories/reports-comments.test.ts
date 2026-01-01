/**
 * Unit tests for database/repositories/reports-comments.ts
 *
 * Tests the ReportsCommentsRepository class for comment report CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReportsCommentsRepository } from '@database/repositories/reports-comments.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
  gt: vi.fn((field, value) => ({ type: 'gt', field, value })),
}));

describe('database/repositories/reports-comments.ts', () => {
  let mockDb: any;
  let mockReportsTable: any;
  let repository: ReportsCommentsRepository;

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

    mockReportsTable = {
      report_id: { name: 'report_id' },
      video_id: { name: 'video_id' },
      comment_id: { name: 'comment_id' },
      timestamp: { name: 'timestamp' },
    };

    repository = new ReportsCommentsRepository(mockDb, mockReportsTable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find report by id', async () => {
      const mockReport = { report_id: 1 };
      mockDb.limit.mockResolvedValue([mockReport]);

      const result = await repository.findById(1);

      expect(result).toEqual(mockReport);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all reports without limit', async () => {
      const mockReports = [{ report_id: 1 }];
      mockDb.orderBy.mockResolvedValue(mockReports);

      const result = await repository.findAll();

      expect(result).toEqual(mockReports);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findByVideoId', () => {
    it('should find reports by video id', async () => {
      const mockReports = [{ report_id: 1 }];
      mockDb.limit.mockResolvedValue(mockReports);

      const result = await repository.findByVideoId('v1');

      expect(mockDb.limit).toHaveBeenCalledWith(20);
      expect(result).toEqual(mockReports);
    });
  });

  describe('findByCommentId', () => {
    it('should find reports by comment id', async () => {
      const mockReports = [{ report_id: 1 }];
      mockDb.limit.mockResolvedValue(mockReports);

      const result = await repository.findByCommentId(1);

      expect(result).toEqual(mockReports);
    });
  });

  describe('getCount', () => {
    it('should return count of reports', async () => {
      mockDb.from.mockResolvedValue([{ count: 20 }]);

      const result = await repository.getCount();

      expect(result).toBe(20);
    });

    it('should return 0 when no reports', async () => {
      mockDb.from.mockResolvedValue([{}]);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a report record', async () => {
      const reportData = { video_id: 'v1', comment_id: 1 };
      const created = { report_id: 1, ...reportData };
      mockDb.returning.mockResolvedValue([created]);

      const result = await repository.create(reportData);

      expect(result).toEqual(created);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ video_id: 'v1' })).rejects.toThrow(
        'Failed to create comment report record'
      );
    });
  });

  describe('delete', () => {
    it('should delete report by id', async () => {
      mockDb.returning.mockResolvedValue([{ report_id: 1 }]);

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when report not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('deleteByVideoId', () => {
    it('should delete all reports for video', async () => {
      mockDb.returning.mockResolvedValue([{}, {}]);

      const result = await repository.deleteByVideoId('v1');

      expect(result).toBe(2);
    });
  });

  describe('deleteByCommentId', () => {
    it('should delete all reports for comment', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}]);

      const result = await repository.deleteByCommentId(1);

      expect(result).toBe(3);
    });
  });

  describe('countNewerThan', () => {
    it('should count reports newer than timestamp', async () => {
      mockDb.where.mockResolvedValue([{ count: 8 }]);

      const result = await repository.countNewerThan(12345);

      expect(result).toBe(8);
    });

    it('should return 0 when result is empty array', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.countNewerThan(99999);

      expect(result).toBe(0);
    });
  });

  describe('deleteAll', () => {
    it('should delete all reports and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}, {}]);

      const result = await repository.deleteAll();

      expect(result).toBe(4);
    });
  });

  describe('createMany', () => {
    it('should create multiple reports', async () => {
      const reportsData = [{ video_id: 'v1' }, { video_id: 'v2' }];
      const created = [{ report_id: 1 }, { report_id: 2 }];
      mockDb.returning.mockResolvedValue(created);

      const result = await repository.createMany(reportsData);

      expect(result).toEqual(created);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
