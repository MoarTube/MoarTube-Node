/**
 * Monetization Service
 *
 * Service layer for crypto wallet address operations including CRUD operations.
 */
import { BaseService } from './base.js';
import type { Logger } from '../utils/logger.js';
import type { IMonetizationService, CreateWalletAddressInput } from './interfaces.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import type { DrizzleCryptoWalletAddress } from '../database/schemas/index.js';

/**
 * MonetizationService class
 *
 * Handles all crypto wallet address-related business logic including:
 * - Wallet address CRUD operations
 */
export class MonetizationService extends BaseService implements IMonetizationService {
  private readonly monetizationRepository: MonetizationRepository;

  constructor(logger: Logger, monetizationRepository: MonetizationRepository) {
    super('MonetizationService', logger);
    this.monetizationRepository = monetizationRepository;
  }

  /**
   * Get all wallet addresses
   */
  async getWalletAddresses(): Promise<DrizzleCryptoWalletAddress[]> {
    return this.withErrorLogging('getWalletAddresses', async () => {
      return this.monetizationRepository.findAll();
    });
  }

  /**
   * Get a wallet address by ID
   */
  async getWalletAddress(walletAddressId: number): Promise<DrizzleCryptoWalletAddress | null> {
    return this.withErrorLogging('getWalletAddress', async () => {
      return this.monetizationRepository.findById(walletAddressId);
    });
  }

  /**
   * Get wallet addresses by chain
   */
  async getWalletAddressesByChain(chain: string): Promise<DrizzleCryptoWalletAddress[]> {
    return this.withErrorLogging('getWalletAddressesByChain', async () => {
      return this.monetizationRepository.findByChain(chain);
    });
  }

  /**
   * Create a new wallet address
   */
  async createWalletAddress(data: CreateWalletAddressInput): Promise<DrizzleCryptoWalletAddress> {
    return this.withErrorLogging('createWalletAddress', async () => {
      return this.monetizationRepository.create({
        wallet_address: data.walletAddress,
        chain: data.chain,
        currency: data.currency,
        chain_id: data.chainId,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Update a wallet address
   */
  async updateWalletAddress(
    walletAddressId: number,
    data: Partial<CreateWalletAddressInput>
  ): Promise<DrizzleCryptoWalletAddress | null> {
    return this.withErrorLogging('updateWalletAddress', async () => {
      const updateData: Partial<{
        wallet_address: string;
        chain: string;
        currency: string;
        chain_id: string;
      }> = {};
      if (data.walletAddress !== undefined) {
        updateData.wallet_address = data.walletAddress;
      }
      if (data.chain !== undefined) {
        updateData.chain = data.chain;
      }
      if (data.currency !== undefined) {
        updateData.currency = data.currency;
      }
      if (data.chainId !== undefined) {
        updateData.chain_id = data.chainId;
      }

      return this.monetizationRepository.update(walletAddressId, updateData);
    });
  }

  /**
   * Delete a wallet address
   */
  async deleteWalletAddress(walletAddressId: number): Promise<boolean> {
    return this.withErrorLogging('deleteWalletAddress', async () => {
      return this.monetizationRepository.delete(walletAddressId);
    });
  }

  /**
   * Count total wallet addresses
   */
  async countWalletAddresses(): Promise<number> {
    return this.withErrorLogging('countWalletAddresses', async () => {
      return this.monetizationRepository.getCount();
    });
  }
}
