/**
 * Account Controller
 *
 * Handles authentication and account-related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.js';
import type { AuthService } from '../services/index.js';
import type { SignInBody } from '../validators/index.js';
import { getConfig } from '../config/index.js';

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
    try {
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
        moarTubeNodeHttpProtocol,
        moarTubeNodeIp,
        moarTubeNodePort,
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
            publicNodePort: moarTubeNodePort,
          });
        }
      }

      this.sendSuccess(reply, {
        isAuthenticated: result.isAuthenticated,
        token: result.token,
      });
    } catch (error) {
      this.logger.error('AccountController.signIn failed', error instanceof Error ? error : null);

      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /account/signout
   *
   * Sign out the current user
   */
  signOut = (_request: FastifyRequest, reply: FastifyReply): void => {
    try {
      this.sendSuccess(reply, {
        wasAuthenticated: true,
      });
    } catch (error) {
      this.logger.error('AccountController.signIn failed', error instanceof Error ? error : null);

      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /account/authenticated
   *
   * Check if the current request is authenticated
   */
  authenticated = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      this.sendSuccess(reply, {
        isAuthenticated: request.isAuthenticated,
      });
    } catch (error) {
      this.logger.error('AccountController.signIn failed', error instanceof Error ? error : null);

      this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };
}
