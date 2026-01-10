/**
 * Auth Service
 *
 * Service layer for authentication and authorization functionality including
 * JWT token management, credential validation, and session handling.
 */
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import { getConfig } from '@config/index.js';
import type { JwtPayload, SignInInput, SignInResult } from '@services/interfaces.js';

/**
 * AccountService class
 *
 * Handles all authentication-related business logic including:
 * - User sign-in and credential validation
 * - JWT token generation and verification
 * - Password management
 */
export class AccountService extends BaseService {
  constructor(logger: Logger) {
    super('AccountService', logger);
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
        const token = this.generateToken(data.username, data.rememberMe);

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
