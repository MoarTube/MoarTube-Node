/**
 * Account Controller
 *
 * Handles authentication and account-related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.js';
import type { AuthService } from '../services/index.js';
import type { SignInBody } from '../validators/index.js';

/**
 * AccountController class
 *
 * Handles:
 * - User sign-in
 * - User sign-out
 * - Authentication status check
 */
export class AccountController extends BaseController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    super('AccountController');
    this.authService = authService;
  }

  /**
   * POST /account/signin
   *
   * Authenticate user with username and password
   */
  signIn = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { username, password, rememberMe } = request.body as SignInBody;

    const result = await this.authService.signIn({
      username,
      password,
      rememberMe,
    });

    this.sendSuccess(reply, {
      isAuthenticated: result.isAuthenticated,
      token: result.token,
    });
  };

  /**
   * GET /account/signout
   *
   * Sign out the current user
   */
  signOut = (_request: FastifyRequest, reply: FastifyReply): void => {
    this.sendSuccess(reply, { wasAuthenticated: true });
  };

  /**
   * GET /account/authenticated
   *
   * Check if the current request is authenticated
   */
  authenticated = (request: FastifyRequest, reply: FastifyReply): void => {
    this.sendSuccess(reply, {
      isAuthenticated: request.isAuthenticated,
    });
  };
}
