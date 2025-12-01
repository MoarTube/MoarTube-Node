/**
 * Helper Functions
 *
 * General-purpose utility functions used throughout the application.
 */

import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as os from 'os';
import * as path from 'path';

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
 * Generate JWT token
 * @param payload - Token payload
 * @param secret - JWT secret
 * @param expiresIn - Expiration time (e.g., '1h', '7d')
 */
export function generateJwtToken(payload: object, secret: string, expiresIn?: string): string {
  const options: jwt.SignOptions = {};
  if (expiresIn !== undefined && expiresIn !== '') {
    options.expiresIn = expiresIn;
  }
  return jwt.sign(payload, secret, options);
}

/**
 * Sanitize tags by normalizing whitespace
 * @param tags - Tags string to sanitize
 */
export function sanitizeTagsSpaces(tags: string): string {
  return tags.replace(/\s+/g, ' ').trim();
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
        process.env['SystemRoot'] ?? 'C:\\Windows',
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
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeLabel = sizes[i] ?? 'Bytes';

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizeLabel;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 * @param seconds - Duration in seconds
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse duration string (HH:MM:SS or MM:SS) to seconds
 * @param duration - Duration string
 */
export function parseDuration(duration: string): number {
  const parts = duration.split(':').map((p) => parseInt(p, 10));

  if (parts.length === 3) {
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    const seconds = parts[2] ?? 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parts[0] ?? 0;
    const seconds = parts[1] ?? 0;
    return minutes * 60 + seconds;
  }

  return parseInt(duration, 10) || 0;
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelayMs - Base delay in milliseconds
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Chunk an array into smaller arrays
 * @param array - Array to chunk
 * @param size - Chunk size
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

/**
 * Deep clone an object
 * @param obj - Object to clone
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
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

/**
 * Debounce a function
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return function (this: unknown, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Throttle a function
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Escape HTML special characters
 * @param str - String to escape
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

/**
 * Unescape HTML special characters
 * @param str - String to unescape
 */
export function unescapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => htmlEntities[entity] ?? entity);
}

/**
 * Truncate a string to a maximum length
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to append if truncated
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  if (str === '') {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a string to title case
 */
export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

/**
 * Check if running in Docker environment
 */
export function isDockerEnvironment(): boolean {
  try {
    // Use dynamic import-style check to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const fsModule = require('fs') as { existsSync: (path: string) => boolean };
    return fsModule.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get current Unix timestamp in seconds
 */
export function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Parse a URL and extract components
 */
export interface ParsedUrl {
  protocol: string;
  host: string;
  port: string;
  path: string;
  query: string;
  hash: string;
}

/**
 * Build a URL from components
 * @param protocol - Protocol (http/https)
 * @param address - Host address
 * @param port - Port number
 * @param path - URL path
 */
export function buildUrl(
  protocol: 'http' | 'https',
  address: string,
  port: number | string,
  pathPart = ''
): string {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
  let portString = '';

  if (protocol === 'http' && portNum !== 80) {
    portString = `:${portNum}`;
  } else if (protocol === 'https' && portNum !== 443) {
    portString = `:${portNum}`;
  }

  return `${protocol}://${address}${portString}${pathPart}`;
}
