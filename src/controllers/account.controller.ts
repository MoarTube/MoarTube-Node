/**
 * Account Controller
 *
 * Handles authentication and account-related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import type { AuthService } from '../services';
import type { SignInBody } from '../validators';
import { getConfig } from '../config';

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
    const {
      username,
      password,
      moarTubeNodeHttpProtocol,
      moarTubeNodeIp,
      moarTubeNodePort,
      rememberMe,
    } = request.body as SignInBody;

    const result = await this.authService.signIn({
      username,
      password,
      rememberMe,
    });

    if (result.isAuthenticated) {
      // Update node settings if this is first login (empty values)
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (
        nodeSettings.publicNodeProtocol === '' &&
        nodeSettings.publicNodeAddress === '' &&
        nodeSettings.publicNodePort === ''
      ) {
        config.updateNodeSettings({
          publicNodeProtocol: moarTubeNodeHttpProtocol,
          publicNodeAddress: moarTubeNodeIp,
          publicNodePort: String(moarTubeNodePort),
        });
      }
    }

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
    // In JWT-based auth, signout is handled client-side by discarding the token
    // The session (if using express-session compatibility) is cleared here
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
