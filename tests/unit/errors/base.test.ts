import { describe, it, expect, vi } from 'vitest';
import { AppError } from '@/errors/base.js';

describe('errors/base.ts', () => {
  describe('AppError class', () => {
    it('should create an AppError with message', () => {
      const error = new AppError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AppError');
      expect(error.isOperational).toBeUndefined(); // abstract property
      expect(error.statusCode).toBeUndefined(); // abstract property
    });

    it('should create an AppError with cause', () => {
      const cause = new Error('Original error');
      const error = new AppError('Test error message', cause);

      expect(error.message).toBe('Test error message');
      expect(error.cause).toBe(cause);
    });

    it('should have proper prototype chain', () => {
      const error = new AppError('Test error');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should convert to JSON', () => {
      // Create a concrete implementation for testing
      class TestError extends AppError {
        readonly statusCode = 500;
        readonly isOperational = false;
      }

      const error = new TestError('Test error message');
      const json = error.toJSON();

      expect(json).toEqual({
        isError: true,
        message: 'Test error message',
        statusCode: 500,
      });
    });

    it('should maintain stack trace', () => {
      const error = new AppError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should handle error chaining', () => {
      const originalError = new Error('Original cause');
      const appError = new AppError('App error message', originalError);

      expect(appError.cause).toBe(originalError);
      expect(appError.message).toBe('App error message');
    });

    it('should handle environments without Error.captureStackTrace', () => {
      // Mock Error.captureStackTrace to be undefined
      const originalCaptureStackTrace = Error.captureStackTrace;
      // @ts-expect-error - intentionally setting to undefined for testing
      Error.captureStackTrace = undefined;

      try {
        const error = new AppError('Test error');
        expect(error.message).toBe('Test error');
        expect(error.stack).toBeDefined(); // Stack should still be set by super()
      } finally {
        // Restore original
        Error.captureStackTrace = originalCaptureStackTrace;
      }
    });
  });
});