/**
 * Base Service Tests
 *
 * Tests for the BaseService abstract class that provides common functionality
 * for all service classes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseService } from '@/services/base.js';
import type { Logger } from '@/utils/logger.js';

// Create a concrete implementation of the abstract class for testing
class TestService extends BaseService {
  constructor(logger: Logger) {
    super('TestService', logger);
  }

  // Expose protected methods for testing
  public testGetCurrentTimestampMs(): number {
    return this.getCurrentTimestampMs();
  }

  public testSafeJsonParse<T>(json: string, fallback: T): T {
    return this.safeJsonParse(json, fallback);
  }

  public testWithErrorLogging<T>(operation: string, fn: () => T | Promise<T>): Promise<T> {
    return this.withErrorLogging(operation, fn);
  }

  public testSanitizeWhitespace(str: string): string {
    return this.sanitizeWhitespace(str);
  }

  public testGenerateId(length?: number): string {
    return this.generateId(length);
  }

  public testDelay(ms: number): Promise<void> {
    return this.delay(ms);
  }

  public getLogger(): Logger {
    return this.logger;
  }
}

describe('BaseService', () => {
  let mockLogger: Logger;
  let service: TestService;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    service = new TestService(mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(service.getLogger()).toBe(mockLogger);
    });

    it('should accept service name parameter', () => {
      const anotherService = new TestService(mockLogger);
      expect(anotherService).toBeInstanceOf(BaseService);
    });
  });

  describe('getCurrentTimestampMs', () => {
    it('should return current timestamp in milliseconds', () => {
      const before = Date.now();
      const timestamp = service.testGetCurrentTimestampMs();
      const after = Date.now();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should return a number', () => {
      const timestamp = service.testGetCurrentTimestampMs();
      expect(typeof timestamp).toBe('number');
    });

    it('should return a reasonable timestamp value', () => {
      const timestamp = service.testGetCurrentTimestampMs();
      // Timestamp should be after year 2020
      expect(timestamp).toBeGreaterThan(1577836800000);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"name": "test", "value": 123}';
      const result = service.testSafeJsonParse(json, {});

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { default: true };
      const result = service.testSafeJsonParse('invalid json', fallback);

      expect(result).toBe(fallback);
    });

    it('should parse JSON arrays', () => {
      const json = '[1, 2, 3]';
      const result = service.testSafeJsonParse<number[]>(json, []);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse nested objects', () => {
      const json = '{"outer": {"inner": "value"}}';
      const result = service.testSafeJsonParse(json, {});

      expect(result).toEqual({ outer: { inner: 'value' } });
    });

    it('should return fallback for empty string', () => {
      const fallback = { empty: true };
      const result = service.testSafeJsonParse('', fallback);

      expect(result).toBe(fallback);
    });

    it('should return fallback for malformed JSON', () => {
      const fallback = 'default';
      const result = service.testSafeJsonParse('{"unclosed": ', fallback);

      expect(result).toBe(fallback);
    });

    it('should parse primitive values', () => {
      expect(service.testSafeJsonParse('"string"', '')).toBe('string');
      expect(service.testSafeJsonParse('42', 0)).toBe(42);
      expect(service.testSafeJsonParse('true', false)).toBe(true);
      expect(service.testSafeJsonParse('null', 'fallback')).toBe(null);
    });
  });

  describe('withErrorLogging', () => {
    it('should execute sync function and return result', async () => {
      const fn = vi.fn().mockReturnValue('result');

      const result = await service.testWithErrorLogging('testOp', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute async function and return result', async () => {
      const fn = vi.fn().mockResolvedValue('async result');

      const result = await service.testWithErrorLogging('testOp', fn);

      expect(result).toBe('async result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should log error and rethrow on sync function failure', async () => {
      const error = new Error('Sync error');
      const fn = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(service.testWithErrorLogging('failingOp', fn)).rejects.toThrow('Sync error');

      expect(mockLogger.error).toHaveBeenCalledWith('failingOp failed', error);
    });

    it('should log error and rethrow on async function failure', async () => {
      const error = new Error('Async error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(service.testWithErrorLogging('asyncFailOp', fn)).rejects.toThrow('Async error');

      expect(mockLogger.error).toHaveBeenCalledWith('asyncFailOp failed', error);
    });

    it('should include operation name in error log', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(service.testWithErrorLogging('specificOperation', fn)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith('specificOperation failed', error);
    });
  });

  describe('sanitizeWhitespace', () => {
    it('should trim leading and trailing whitespace', () => {
      const result = service.testSanitizeWhitespace('  hello  ');
      expect(result).toBe('hello');
    });

    it('should collapse multiple spaces', () => {
      const result = service.testSanitizeWhitespace('hello    world');
      expect(result).toBe('hello world');
    });

    it('should handle tabs and newlines', () => {
      const result = service.testSanitizeWhitespace('hello\t\nworld');
      expect(result).toBe('hello world');
    });

    it('should handle mixed whitespace', () => {
      const result = service.testSanitizeWhitespace('  hello  \t  world  \n  ');
      expect(result).toBe('hello world');
    });

    it('should return empty string for whitespace-only input', () => {
      const result = service.testSanitizeWhitespace('   \t\n   ');
      expect(result).toBe('');
    });

    it('should not modify strings without extra whitespace', () => {
      const result = service.testSanitizeWhitespace('hello world');
      expect(result).toBe('hello world');
    });

    it('should handle empty string', () => {
      const result = service.testSanitizeWhitespace('');
      expect(result).toBe('');
    });
  });

  describe('generateId', () => {
    it('should generate ID of default length 11', () => {
      const id = service.testGenerateId();
      expect(id.length).toBe(11);
    });

    it('should generate ID of custom length', () => {
      const id = service.testGenerateId(20);
      expect(id.length).toBe(20);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(service.testGenerateId());
      }
      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should only contain valid characters', () => {
      const validChars = /^[0-9A-Za-z_-]+$/;
      for (let i = 0; i < 50; i++) {
        const id = service.testGenerateId();
        expect(id).toMatch(validChars);
      }
    });

    it('should limit hyphens to at most 1', () => {
      // Generate many IDs to ensure the constraint is enforced
      for (let i = 0; i < 100; i++) {
        const id = service.testGenerateId(20);
        const hyphenCount = (id.match(/-/g) ?? []).length;
        expect(hyphenCount).toBeLessThanOrEqual(1);
      }
    });

    it('should limit underscores to at most 1', () => {
      // Generate many IDs to ensure the constraint is enforced
      for (let i = 0; i < 100; i++) {
        const id = service.testGenerateId(20);
        const underscoreCount = (id.match(/_/g) ?? []).length;
        expect(underscoreCount).toBeLessThanOrEqual(1);
      }
    });

    it('should generate short IDs', () => {
      const id = service.testGenerateId(1);
      expect(id.length).toBe(1);
    });

    it('should handle zero length gracefully', () => {
      const id = service.testGenerateId(0);
      expect(id.length).toBe(0);
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await service.testDelay(50);
      const elapsed = Date.now() - start;

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should return a promise', () => {
      const result = service.testDelay(1);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await service.testDelay(0);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});
