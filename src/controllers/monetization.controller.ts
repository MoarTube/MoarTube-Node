/**
 * Monetization Controller
 *
 * Handles crypto wallet address management endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import type { MonetizationRepository } from '../database/repositories/monetization.repository';
import type { CloudflareService } from '../services/cloudflare.service';
import { getCurrentUnixTimestamp } from '../utils';

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
    private readonly monetizationRepository: MonetizationRepository,
    private readonly cloudflareService: CloudflareService
  ) {
    super('MonetizationController');
  }

  /**
   * GET /monetization/all
   *
   * Get all crypto wallet addresses
   */
  getAllWalletAddresses = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const cryptoWalletAddresses = await this.monetizationRepository.findAll();
      this.sendSuccess(reply, { cryptoWalletAddresses });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /monetization/add
   *
   * Add a new crypto wallet address
   */
  addWalletAddress = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { walletAddress, chain, currency } = request.body as AddWalletAddressBody;

      const timestamp = getCurrentUnixTimestamp();
      const chainId = getChainId(chain);

      const cryptoWalletAddress = await this.monetizationRepository.create({
        walletAddress,
        chain,
        chainId,
        currency,
        timestamp,
      });

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      this.sendSuccess(reply, { cryptoWalletAddress });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /monetization/delete
   *
   * Delete a crypto wallet address
   */
  deleteWalletAddress = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { cryptoWalletAddressId } = request.body as DeleteWalletAddressBody;

      const deleted = await this.monetizationRepository.delete(cryptoWalletAddressId);

      if (!deleted) {
        this.sendError(reply, 'wallet address not found', 404);
        return;
      }

      // Purge Cloudflare cache for node page and watch pages
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
