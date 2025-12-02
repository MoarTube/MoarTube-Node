/**
 * Auth Service
 *
 * Service layer for authentication and authorization functionality including
 * JWT token management, credential validation, and session handling.
 */
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { BaseService, type ServiceOptions } from './base';
import type { IAuthService, SignInInput, SignInResult } from './interfaces';
import { getConfig } from '../config';

/**
 * JWT payload structure
 */
export interface JwtPayload {
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * AuthService class
 *
 * Handles all authentication-related business logic including:
 * - User sign-in and credential validation
 * - JWT token generation and verification
 * - Password management
 */
export class AuthService extends BaseService implements IAuthService {
  constructor(options?: ServiceOptions) {
    super('AuthService', options);
  }

  /**
   * Sign in with credentials
   */
  async signIn(data: SignInInput): Promise<SignInResult> {
    return this.withErrorLogging('signIn', () => {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Decode stored credentials (base64 encoded bcrypt hashes)
      const usernameHash = Buffer.from(
        decodeURIComponent(nodeSettings.username),
        'base64'
      ).toString('utf8');
      const passwordHash = Buffer.from(
        decodeURIComponent(nodeSettings.password),
        'base64'
      ).toString('utf8');

      // Validate credentials using bcrypt
      const isUsernameValid = bcryptjs.compareSync(data.username, usernameHash);
      const isPasswordValid = bcryptjs.compareSync(data.password, passwordHash);

      if (isUsernameValid && isPasswordValid) {
        // Generate JWT token
        const token = this.generateToken(data.username, data.rememberMe === true);

        this.logger.info('User signed in successfully', { username: data.username });

        return {
          isAuthenticated: true,
          token,
        };
      } else {
        this.logger.warn('Failed sign-in attempt', { username: data.username });

        return {
          isAuthenticated: false,
        };
      }
    });
  }

  /**
   * Verify a JWT token
   */
  verifyToken(token: string): { valid: boolean; username?: string } {
    try {
      const config = getConfig();
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

      return {
        valid: true,
        username: decoded.username,
      };
    } catch (error) {
      this.logger.debug('Token verification failed', {
        error: (error as Error).message,
      });

      return {
        valid: false,
      };
    }
  }

  /**
   * Change password
   *
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @returns true if password was changed successfully
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    return this.withErrorLogging('changePassword', async () => {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Decode stored password hash
      const passwordHash = Buffer.from(
        decodeURIComponent(nodeSettings.password),
        'base64'
      ).toString('utf8');

      // Verify current password
      const isCurrentPasswordValid = bcryptjs.compareSync(currentPassword, passwordHash);

      if (!isCurrentPasswordValid) {
        this.logger.warn('Password change failed - invalid current password');
        return false;
      }

      // Hash new password
      const saltRounds = 10;
      const newPasswordHash = await bcryptjs.hash(newPassword, saltRounds);
      const encodedHash = Buffer.from(newPasswordHash, 'utf8').toString('base64');

      // Update settings with new password
      config.updateNodeSettings({
        password: encodeURIComponent(encodedHash),
      });

      this.logger.info('Password changed successfully');
      return true;
    });
  }

  /**
   * Get the JWT secret
   */
  getJwtSecret(): string {
    const config = getConfig();
    return config.jwtSecret;
  }

  /**
   * Validate admin credentials (synchronous check)
   */
  validateCredentials(username: string, password: string): boolean {
    try {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      const usernameHash = Buffer.from(
        decodeURIComponent(nodeSettings.username),
        'base64'
      ).toString('utf8');
      const passwordHash = Buffer.from(
        decodeURIComponent(nodeSettings.password),
        'base64'
      ).toString('utf8');

      const isUsernameValid = bcryptjs.compareSync(username, usernameHash);
      const isPasswordValid = bcryptjs.compareSync(password, passwordHash);

      return isUsernameValid && isPasswordValid;
    } catch {
      return false;
    }
  }

  /**
   * Check if a request is authenticated
   *
   * @param token - JWT token to check
   * @returns true if authenticated
   */
  isAuthenticated(token: string | null | undefined): boolean {
    if (token === null || token === undefined || token === '') {
      return false;
    }

    const result = this.verifyToken(token);
    return result.valid;
  }

  /**
   * Hash a password for storage
   *
   * @param password - Plain text password
   * @returns Base64 encoded bcrypt hash
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    const hash = await bcryptjs.hash(password, saltRounds);
    return Buffer.from(hash, 'utf8').toString('base64');
  }

  /**
   * Hash a username for storage
   *
   * @param username - Plain text username
   * @returns Base64 encoded bcrypt hash
   */
  async hashUsername(username: string): Promise<string> {
    const saltRounds = 10;
    const hash = await bcryptjs.hash(username, saltRounds);
    return Buffer.from(hash, 'utf8').toString('base64');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Generate a JWT token
   */
  private generateToken(username: string, rememberMe?: boolean): string {
    const config = getConfig();
    const payload: JwtPayload = { username };

    const options: jwt.SignOptions = {};

    if (rememberMe !== true) {
      // Token expires in 1 day if not "remember me"
      options.expiresIn = '1d';
    }
    // If rememberMe is true, token doesn't expire

    return jwt.sign(payload, config.jwtSecret, options);
  }
}
