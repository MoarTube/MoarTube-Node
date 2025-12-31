/**
 * Helper Functions
 *
 * General-purpose utility functions used throughout the application.
 */

import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * JWT verification result
 */
export interface JwtVerifyResult {
  isValid: boolean;
  decoded?: jwt.JwtPayload;
  error?: string;
}

/**
 * Verify JWT token
 * @param token - JWT token to verify
 * @param secret - JWT secret
 */
export function verifyJwtToken(token: string | null | undefined, secret: string): JwtVerifyResult {
  if (token === null || token === undefined || token === '') {
    return { isValid: false, error: 'Token is empty' };
  }

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    return { isValid: true, decoded };
  } catch (error) {
    return {
      isValid: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Sanitize tags by normalizing whitespace
 * @param tags - Tags string to sanitize
 */
export function sanitizeTagsSpaces(tags: string): string {
  return tags.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Generate a random string
 * @param length - Length of the string
 * @param characters - Character set to use
 */
export function generateRandomString(
  length: number,
  characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
): string {
  let result = '';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

/**
 * Generate a unique video ID (11 characters, YouTube-like format)
 * Uses URL-safe characters with limits on special characters
 */
export function generateVideoIdCandidate(): string {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const length = 11;

  let videoId = '';

  for (let i = 0; i < length; i++) {
    videoId += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return videoId;
}

/**
 * Generate a cryptographically secure random string
 * @param length - Length of the string (in bytes, output will be hex encoded)
 */
export function generateSecureRandomString(length: number): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a string using SHA256
 * @param input - String to hash
 */
export function sha256Hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a password using bcrypt-like format
 * Note: For actual password hashing, use bcrypt library
 * @param password - Password to hash
 * @param salt - Optional salt
 */
export function hashPassword(password: string, salt?: string): string {
  const useSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return `${useSalt}:${hash}`;
}

/**
 * Verify a hashed password
 * @param password - Password to verify
 * @param hashedPassword - Stored hashed password (salt:hash format)
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  if (salt === undefined || salt === '' || hash === undefined || hash === '') {
    return false;
  }

  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');

  return hash === verifyHash;
}

/**
 * Get the path to the system hosts file
 */
export function getHostsFilePath(): string {
  const platform = os.platform();

  switch (platform) {
    case 'win32':
      return path.join(
        process.env['SystemRoot'] ?? String.raw`C:\Windows`,
        'System32',
        'drivers',
        'etc',
        'hosts'
      );
    case 'darwin':
    case 'linux':
      return '/etc/hosts';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Deep merge objects
 * @param target - Target object
 * @param sources - Source objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Array<Partial<T> | undefined | null>
): T {
  const result: Record<string, unknown> = { ...target };

  for (const source of sources) {
    if (source === null || source === undefined) {
      continue;
    }

    for (const key of Object.keys(source)) {
      const targetValue = result[key];
      const sourceValue = (source as Record<string, unknown>)[key];

      if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}
