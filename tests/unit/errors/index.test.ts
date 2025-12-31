import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ValidationErrorDetails,
} from '@/errors/index.js';

describe('errors/index.ts', () => {
  describe('barrel exports', () => {
    it('should export AppError from base', () => {
      expect(AppError).toBeDefined();
      expect(typeof AppError).toBe('function');
    });

    it('should export BadRequestError from http', () => {
      expect(BadRequestError).toBeDefined();
      expect(typeof BadRequestError).toBe('function');

      const error = new BadRequestError('Test');
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
    });

    it('should export UnauthorizedError from http', () => {
      expect(UnauthorizedError).toBeDefined();
      expect(typeof UnauthorizedError).toBe('function');

      const error = new UnauthorizedError('Test');
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
    });

    it('should export ForbiddenError from http', () => {
      expect(ForbiddenError).toBeDefined();
      expect(typeof ForbiddenError).toBe('function');

      const error = new ForbiddenError('Test');
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
    });

    it('should export NotFoundError from http', () => {
      expect(NotFoundError).toBeDefined();
      expect(typeof NotFoundError).toBe('function');

      const error = new NotFoundError('Test');
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
    });

    it('should export ValidationError from http', () => {
      expect(ValidationError).toBeDefined();
      expect(typeof ValidationError).toBe('function');

      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.errors).toEqual([]);
    });

    it('should export ValidationErrorDetails type', () => {
      // Type-only test - if this compiles, the type is properly exported
      const details: ValidationErrorDetails = {
        field: 'test',
        message: 'test message',
        code: 'TEST',
      };

      expect(details.field).toBe('test');
      expect(details.message).toBe('test message');
      expect(details.code).toBe('TEST');
    });

    it('should create ValidationError with ValidationErrorDetails', () => {
      const details: ValidationErrorDetails[] = [
        { field: 'username', message: 'Required', code: 'REQUIRED' },
        { field: 'email', message: 'Invalid format' },
      ];

      const error = new ValidationError('Validation failed', details);

      expect(error.errors).toEqual(details);
      expect(error.errors[0].code).toBe('REQUIRED');
      expect(error.errors[1].code).toBeUndefined();
    });
  });
});