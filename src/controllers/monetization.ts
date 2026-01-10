/**
 * Monetization Controller
 *
 * Handles crypto wallet address management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { MonetizationService, CloudflareService } from '@services/index.js';

/**
 * Request body for adding a wallet address
 */
export interface AddWalletAddressBody {
  walletAddress: string;
  chain: string;
  currency: string;
}

/**
 * Request body for deleting a wallet address
 */
export interface DeleteWalletAddressBody {
  cryptoWalletAddressId: number;
}

/**
 * Get chain ID based on chain name
 */
function getChainId(chain: string): string {
  switch (chain) {
    case 'ETH':
      return '0x1';
    case 'BNB':
      return '0x38';
    default:
      return '';
  }
}

/**
 * MonetizationController class
 *
 * Handles:
 * - Get all crypto wallet addresses
 * - Add new crypto wallet address
 * - Delete crypto wallet address
 */
export class MonetizationController extends BaseController {
  constructor(
    private readonly monetizationService: MonetizationService,
    private readonly cloudflareService: CloudflareService
  ) {
    super('MonetizationController');
  }

  /**
   * GET /monetization/all
   *
   * Get all crypto wallet addresses
   */
  getAllWalletAddresses = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const cryptoWalletAddresses = await this.monetizationService.getWalletAddresses();

      return await this.sendSuccess(reply, { cryptoWalletAddresses });
    } catch (error) {
      this.logger.error('Get all wallet addresses failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /monetization/add
   *
   * Add a new crypto wallet address
   */
  addWalletAddress = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { walletAddress, chain, currency } = request.body as AddWalletAddressBody;

      const chainId = getChainId(chain);

      const cryptoWalletAddress = await this.monetizationService.createWalletAddress({
        walletAddress,
        chain,
        chainId,
        currency,
      });

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply, { cryptoWalletAddress });
    } catch (error) {
      this.logger.error('Add wallet address failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /monetization/delete
   *
   * Delete a crypto wallet address
   */
  deleteWalletAddress = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { cryptoWalletAddressId } = request.body as DeleteWalletAddressBody;

      const deleted = await this.monetizationService.deleteWalletAddress(cryptoWalletAddressId);

      if (!deleted) {
        return await this.sendError(reply, 'wallet address not found', 404);
      } else {
        await this.cloudflareService.purgeAllWatchPages();
        await this.cloudflareService.purgeNodePage();

        return await this.sendSuccess(reply);
      }
    } catch (error) {
      this.logger.error('Delete wallet address failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
