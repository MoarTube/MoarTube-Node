import { describe, it, expect } from 'vitest';
import type { PaginationOptions, PaginatedResult } from '@/types/models.js';

describe('types/models.ts', () => {
  describe('PaginationOptions interface', () => {
    it('should create pagination options with limit', () => {
      const options: PaginationOptions = {
        limit: 50,
      };

      expect(options.limit).toBe(50);
    });

    it('should handle optional limit', () => {
      const options: PaginationOptions = {};

      expect(options.limit).toBeUndefined();
    });
  });

  describe('PaginatedResult interface', () => {
    it('should create a paginated result', () => {
      const result: PaginatedResult<string> = {
        data: ['item1', 'item2', 'item3'],
        total: 100,
        count: 3,
        limit: 10,
        hasMore: true,
      };

      expect(result.data).toEqual(['item1', 'item2', 'item3']);
      expect(result.total).toBe(100);
      expect(result.count).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should handle no more results', () => {
      const result: PaginatedResult<number> = {
        data: [1, 2],
        total: 2,
        count: 2,
        limit: 10,
        hasMore: false,
      };

      expect(result.hasMore).toBe(false);
      expect(result.data).toEqual([1, 2]);
      expect(result.total).toBe(2);
    });

    it('should work with complex object types', () => {
      interface TestItem {
        id: string;
        name: string;
      }

      const result: PaginatedResult<TestItem> = {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        total: 50,
        count: 2,
        limit: 20,
        hasMore: true,
      };

      expect(result.data[0].id).toBe('1');
      expect(result.data[0].name).toBe('Item 1');
      expect(result.data[1].id).toBe('2');
      expect(result.data[1].name).toBe('Item 2');
      expect(result.total).toBe(50);
      expect(result.hasMore).toBe(true);
    });
  });
});