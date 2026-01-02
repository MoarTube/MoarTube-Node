/**
 * Account Service Tests
 *
 * Tests for the AccountService class that handles authentication,
 * JWT token generation, and credential validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AccountService } from '@/services/account.js';
import type { Logger } from '@/utils/logger.js';
import type { SignInInput } from '@/services/interfaces.js';

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(),
}));

// Import the mocked getConfig
import { getConfig } from '@config/index.js';

describe('AccountService', () => {
  let service: AccountService;
  let mockLogger: Logger;
  let mockConfig: ReturnType<typeof getConfig>;

  // Test credentials
  const testUsername = 'testuser';
  const testPassword = 'testpassword';
  const testJwtSecret = 'test-jwt-secret-key-for-testing';

  // Create bcrypt hashes and base64 encode them (as stored in config)
  const usernameHash = bcryptjs.hashSync(testUsername, 10);
  const passwordHash = bcryptjs.hashSync(testPassword, 10);
  const encodedUsernameHash = encodeURIComponent(Buffer.from(usernameHash).toString('base64'));
  const encodedPasswordHash = encodeURIComponent(Buffer.from(passwordHash).toString('base64'));

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockConfig = {
      nodeSettings: {
        username: encodedUsernameHash,
        password: encodedPasswordHash,
      },
      jwtSecret: testJwtSecret,
    } as unknown as ReturnType<typeof getConfig>;

    vi.mocked(getConfig).mockReturnValue(mockConfig);

    service = new AccountService(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an AccountService instance', () => {
      expect(service).toBeInstanceOf(AccountService);
    });
  });

  describe('signIn', () => {
    const createSignInInput = (overrides?: Partial<SignInInput>): SignInInput => ({
      username: testUsername,
      password: testPassword,
      moarTubeNodeHttpProtocol: 'https',
      moarTubeNodeIp: '127.0.0.1',
      moarTubeNodePort: 8080,
      rememberMe: false,
      ...overrides,
    });

    describe('successful authentication', () => {
      it('should return isAuthenticated true with valid credentials', async () => {
        const input = createSignInInput();

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(true);
        expect(result.token).toBeDefined();
      });

      it('should return a valid JWT token', async () => {
        const input = createSignInInput();

        const result = await service.signIn(input);

        expect(result.token).toBeDefined();
        // Verify token is valid JWT
        const decoded = jwt.verify(result.token!, testJwtSecret) as { username: string };
        expect(decoded.username).toBe(testUsername);
      });

      it('should log successful sign-in', async () => {
        const input = createSignInInput();

        await service.signIn(input);

        expect(mockLogger.info).toHaveBeenCalledWith('User signed in successfully', {
          username: testUsername,
        });
      });

      it('should generate token with expiration when rememberMe is false', async () => {
        const input = createSignInInput({ rememberMe: false });

        const result = await service.signIn(input);

        const decoded = jwt.decode(result.token!) as { exp?: number };
        expect(decoded.exp).toBeDefined();
      });

      it('should generate token without expiration when rememberMe is true', async () => {
        const input = createSignInInput({ rememberMe: true });

        const result = await service.signIn(input);

        const decoded = jwt.decode(result.token!) as { exp?: number };
        expect(decoded.exp).toBeUndefined();
      });
    });

    describe('failed authentication', () => {
      it('should return isAuthenticated false with invalid username', async () => {
        const input = createSignInInput({ username: 'wronguser' });

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(false);
        expect(result.token).toBeUndefined();
      });

      it('should return isAuthenticated false with invalid password', async () => {
        const input = createSignInInput({ password: 'wrongpassword' });

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(false);
        expect(result.token).toBeUndefined();
      });

      it('should return isAuthenticated false with both credentials invalid', async () => {
        const input = createSignInInput({
          username: 'wronguser',
          password: 'wrongpassword',
        });

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(false);
        expect(result.token).toBeUndefined();
      });

      it('should log failed sign-in attempt', async () => {
        const input = createSignInInput({ username: 'wronguser' });

        await service.signIn(input);

        expect(mockLogger.warn).toHaveBeenCalledWith('Failed sign-in attempt', {
          username: 'wronguser',
        });
      });

      it('should handle empty username', async () => {
        const input = createSignInInput({ username: '' });

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(false);
      });

      it('should handle empty password', async () => {
        const input = createSignInInput({ password: '' });

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(false);
      });
    });

    describe('JWT token generation', () => {
      it('should include username in token payload', async () => {
        const input = createSignInInput();

        const result = await service.signIn(input);

        const decoded = jwt.verify(result.token!, testJwtSecret) as { username: string };
        expect(decoded.username).toBe(testUsername);
      });

      it('should use JWT secret from config', async () => {
        const input = createSignInInput();

        const result = await service.signIn(input);

        // Token should be verifiable with the secret
        expect(() => {
          jwt.verify(result.token!, testJwtSecret);
        }).not.toThrow();
      });

      it('should fail verification with wrong secret', async () => {
        const input = createSignInInput();

        const result = await service.signIn(input);

        expect(() => {
          jwt.verify(result.token!, 'wrong-secret');
        }).toThrow();
      });
    });

    describe('credential encoding', () => {
      it('should properly decode base64 encoded credentials', async () => {
        // This test verifies the credential decoding process works correctly
        const input = createSignInInput();

        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(true);
      });

      it('should handle URL-encoded base64 credentials', async () => {
        // Credentials are URL-encoded base64 strings
        const input = createSignInInput();

        // The mock config already uses URL-encoded base64
        const result = await service.signIn(input);

        expect(result.isAuthenticated).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should throw error if getConfig fails', async () => {
        vi.mocked(getConfig).mockImplementation(() => {
          throw new Error('Config not initialized');
        });

        const input = createSignInInput();

        await expect(service.signIn(input)).rejects.toThrow('Config not initialized');
      });

      it('should log and rethrow errors', async () => {
        const testError = new Error('Test error');
        vi.mocked(getConfig).mockImplementation(() => {
          throw testError;
        });

        const input = createSignInInput();

        await expect(service.signIn(input)).rejects.toThrow('Test error');
        expect(mockLogger.error).toHaveBeenCalledWith('signIn failed', testError);
      });
    });
  });
});
