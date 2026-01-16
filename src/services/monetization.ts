/**
 * Monetization Service
 *
 * Service layer for crypto wallet address operations including CRUD operations.
 */
import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { CreateWalletAddressInput } from '@services/interfaces.js';
import type { IMonetizationRepository, SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress, PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress } from '@database/index.js';

/**
 * MonetizationService class
 *
 * Handles all crypto wallet address-related business logic including:
 * - Wallet address CRUD operations
 */
export class MonetizationService extends BaseService {
  private readonly monetizationRepository: IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>;

  constructor(logger: Logger, monetizationRepository: IMonetizationRepository<SQLiteCryptoWalletAddress, SQLiteNewCryptoWalletAddress> | IMonetizationRepository<PostgresCryptoWalletAddress, PostgresNewCryptoWalletAddress>) {
    super('MonetizationService', logger);
    this.monetizationRepository = monetizationRepository;
  }

  /**
   * Get all wallet addresses
   */
  async getWalletAddresses(): Promise<(SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress)[]> {
    return this.withErrorLogging('getWalletAddresses', async () => {
      return this.monetizationRepository.findAll();
    });
  }

  /**
   * Get a wallet address by ID
   */
  async getWalletAddress(walletAddressId: number): Promise<SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress | null> {
    return this.withErrorLogging('getWalletAddress', async () => {
      return this.monetizationRepository.findById(walletAddressId);
    });
  }

  /**
   * Get wallet addresses by chain
   */
  async getWalletAddressesByChain(chain: string): Promise<(SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress)[]> {
    return this.withErrorLogging('getWalletAddressesByChain', async () => {
      return this.monetizationRepository.findByChain(chain);
    });
  }

  /**
   * Create a new wallet address
   */
  async createWalletAddress(data: CreateWalletAddressInput): Promise<SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress> {
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
  ): Promise<SQLiteCryptoWalletAddress | PostgresCryptoWalletAddress | null> {
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
