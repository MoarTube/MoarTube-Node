/**
 * Account Controller
 *
 * Handles authentication and account-related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.js';
import type { AccountService } from '../services/index.js';
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
  private readonly accountService: AccountService;

  constructor(accountService: AccountService) {
    super('AccountController');
    this.accountService = accountService;
  }

  /**
   * POST /account/signin
   *
   * Authenticate user with username and password
   */
  signIn = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const {
        username,
        password,
        moarTubeNodeHttpProtocol,
        moarTubeNodeIp,
        moarTubeNodePort,
        rememberMe,
      } = request.body as SignInBody;

      const result = await this.accountService.signIn({
        username,
        password,
        moarTubeNodeHttpProtocol,
        moarTubeNodeIp,
        moarTubeNodePort,
        rememberMe,
      });

      if (result.isAuthenticated) {
        const config = getConfig();

        const nodeSettings = config.nodeSettings;

        // Update node settings if this is first login (empty values)
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

      return await this.sendSuccess(reply, {
        isAuthenticated: result.isAuthenticated,
        token: result.token,
      });
    } catch (error) {
      this.logger.error('AccountController.signIn failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /account/signout
   *
   * Sign out the current user
   */
  signOut = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await this.sendSuccess(reply, {
        wasAuthenticated: true,
      });
    } catch (error) {
      this.logger.error('AccountController.signOut failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /account/authenticated
   *
   * Check if the current request is authenticated
   */
  authenticated = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await this.sendSuccess(reply, {
        isAuthenticated: request.isAuthenticated,
      });
    } catch (error) {
      this.logger.error('AccountController.authenticated failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };
}
