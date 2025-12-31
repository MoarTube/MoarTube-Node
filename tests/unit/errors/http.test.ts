import { describe, it, expect } from 'vitest';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ValidationErrorDetails,
} from '@/errors/http.js';

describe('errors/http.ts', () => {
  describe('BadRequestError class', () => {
    it('should create BadRequestError with default message', () => {
      const error = new BadRequestError();

      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('BadRequestError');
    });

    it('should create BadRequestError with custom message', () => {
      const error = new BadRequestError('Custom bad request message');

      expect(error.message).toBe('Custom bad request message');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should convert to JSON', () => {
      const error = new BadRequestError('Test bad request');
      const json = error.toJSON();

      expect(json).toEqual({
        isError: true,
        message: 'Test bad request',
        statusCode: 400,
      });
    });
  });

  describe('UnauthorizedError class', () => {
    it('should create UnauthorizedError with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create UnauthorizedError with custom message', () => {
      const error = new UnauthorizedError('Custom unauthorized message');

      expect(error.message).toBe('Custom unauthorized message');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('ForbiddenError class', () => {
    it('should create ForbiddenError with default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('ForbiddenError');
    });

    it('should create ForbiddenError with custom message', () => {
      const error = new ForbiddenError('Custom forbidden message');

      expect(error.message).toBe('Custom forbidden message');
      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('NotFoundError class', () => {
    it('should create NotFoundError with default message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create NotFoundError with custom message', () => {
      const error = new NotFoundError('Custom not found message');

      expect(error.message).toBe('Custom not found message');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('ValidationError class', () => {
    it('should create ValidationError with default message and no errors', () => {
      const error = new ValidationError();

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toEqual([]);
    });

    it('should create ValidationError with custom message and validation errors', () => {
      const validationErrors: ValidationErrorDetails[] = [
        { field: 'username', message: 'Username is required' },
        { field: 'email', message: 'Email must be valid', code: 'INVALID_EMAIL' },
      ];

      const error = new ValidationError('Multiple validation errors', validationErrors);

      expect(error.message).toBe('Multiple validation errors');
      expect(error.errors).toEqual(validationErrors);
    });

    it('should convert ValidationError to JSON with errors', () => {
      const validationErrors: ValidationErrorDetails[] = [
        { field: 'password', message: 'Password too short' },
      ];

      const error = new ValidationError('Validation failed', validationErrors);
      const json = error.toJSON();

      expect(json).toEqual({
        isError: true,
        message: 'Validation failed',
        statusCode: 400,
        errors: validationErrors,
      });
    });

    it('should handle ValidationErrorDetails with optional code', () => {
      const errorDetails: ValidationErrorDetails = {
        field: 'age',
        message: 'Age must be a number',
        code: 'INVALID_TYPE',
      };

      const error = new ValidationError('Type validation failed', [errorDetails]);

      expect(error.errors[0].field).toBe('age');
      expect(error.errors[0].message).toBe('Age must be a number');
      expect(error.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should handle ValidationErrorDetails without code', () => {
      const errorDetails: ValidationErrorDetails = {
        field: 'name',
        message: 'Name is required',
      };

      const error = new ValidationError('Required field missing', [errorDetails]);

      expect(error.errors[0].field).toBe('name');
      expect(error.errors[0].message).toBe('Name is required');
      expect(error.errors[0].code).toBeUndefined();
    });
  });

  describe('ValidationErrorDetails interface', () => {
    it('should create validation error details with all fields', () => {
      const details: ValidationErrorDetails = {
        field: 'email',
        message: 'Invalid email format',
        code: 'INVALID_FORMAT',
      };

      expect(details.field).toBe('email');
      expect(details.message).toBe('Invalid email format');
      expect(details.code).toBe('INVALID_FORMAT');
    });

    it('should create validation error details without code', () => {
      const details: ValidationErrorDetails = {
        field: 'username',
        message: 'Username already exists',
      };

      expect(details.field).toBe('username');
      expect(details.message).toBe('Username already exists');
      expect(details.code).toBeUndefined();
    });
  });
});