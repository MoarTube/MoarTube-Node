import { describe, it, expect } from 'vitest';
import {
  verifyJwtToken,
  sanitizeTagsSpaces,
  generateRandomString,
  generateVideoIdCandidate,
  generateSecureRandomString,
  sha256Hash,
  hashPassword,
  verifyPassword,
  getHostsFilePath,
} from '@utils/helpers.js';

describe('verifyJwtToken', () => {
  it('should return invalid for empty token', () => {
    const result = verifyJwtToken('', 'secret');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Token is empty');
  });

  it('should return invalid for null token', () => {
    const result = verifyJwtToken(null, 'secret');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Token is empty');
  });

  it('should return invalid for undefined token', () => {
    const result = verifyJwtToken(undefined, 'secret');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Token is empty');
  });

  it('should verify a valid JWT token', () => {
    const jwt = require('jsonwebtoken');
    const secret = 'test-secret';
    const payload = { userId: 123 };
    const token = jwt.sign(payload, secret);

    const result = verifyJwtToken(token, secret);
    expect(result.isValid).toBe(true);
    expect(result.decoded).toMatchObject(payload);
  });

  it('should return invalid for invalid token', () => {
    const result = verifyJwtToken('invalid-token', 'secret');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('sanitizeTagsSpaces', () => {
  it('should trim leading and trailing whitespace', () => {
    expect(sanitizeTagsSpaces('  hello world  ')).toBe('hello world');
  });

  it('should replace multiple spaces with single space', () => {
    expect(sanitizeTagsSpaces('hello   world')).toBe('hello world');
  });

  it('should handle tabs and newlines', () => {
    expect(sanitizeTagsSpaces('hello\t\nworld')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(sanitizeTagsSpaces('')).toBe('');
  });
});

describe('generateRandomString', () => {
  it('should generate string of specified length', () => {
    const result = generateRandomString(10);
    expect(result).toHaveLength(10);
  });

  it('should use default character set', () => {
    const result = generateRandomString(5);
    expect(result).toMatch(/^[0-9A-Za-z]{5}$/);
  });

  it('should use custom character set', () => {
    const result = generateRandomString(3, 'abc');
    expect(result).toMatch(/^[abc]{3}$/);
  });
});

describe('generateVideoIdCandidate', () => {
  it('should generate 11 character string', () => {
    const result = generateVideoIdCandidate();
    expect(result).toHaveLength(11);
  });

  it('should use alphanumeric characters', () => {
    const result = generateVideoIdCandidate();
    expect(result).toMatch(/^[0-9A-Za-z]{11}$/);
  });
});

describe('generateSecureRandomString', () => {
  it('should generate hex string of correct length', () => {
    const result = generateSecureRandomString(8);
    expect(result).toHaveLength(16); // 8 bytes = 16 hex chars
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('sha256Hash', () => {
  it('should hash string consistently', () => {
    const input = 'test';
    const hash1 = sha256Hash(input);
    const hash2 = sha256Hash(input);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex is 64 chars
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256Hash('test1');
    const hash2 = sha256Hash('test2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('hashPassword and verifyPassword', () => {
  it('should hash and verify password correctly', () => {
    const password = 'mypassword';
    const hashed = hashPassword(password);
    const isValid = verifyPassword(password, hashed);
    expect(isValid).toBe(true);
  });

  it('should reject wrong password', () => {
    const password = 'mypassword';
    const hashed = hashPassword(password);
    const isValid = verifyPassword('wrongpassword', hashed);
    expect(isValid).toBe(false);
  });

  it('should handle invalid hash format', () => {
    const isValid = verifyPassword('password', 'invalid');
    expect(isValid).toBe(false);
  });

  it('should handle empty hash parts', () => {
    const isValid = verifyPassword('password', ':');
    expect(isValid).toBe(false);
  });
});

describe('getHostsFilePath', () => {
  it('should return correct path for Windows', () => {
    // Mock platform
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const path = getHostsFilePath();
    expect(path).toContain('System32');
    expect(path).toContain('hosts');

    // Restore
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should return correct path for Linux', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const path = getHostsFilePath();
    expect(path).toBe('/etc/hosts');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should return correct path for macOS', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const path = getHostsFilePath();
    expect(path).toBe('/etc/hosts');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should throw error for unsupported platform', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'unsupported' });

    expect(() => getHostsFilePath()).toThrow('Unsupported platform');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });
});