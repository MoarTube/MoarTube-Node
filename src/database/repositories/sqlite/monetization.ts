/**
 * Monetization Repository
 *
 * Provides data access methods for crypto wallet address records using Drizzle ORM.
 */
import { eq, desc, count } from 'drizzle-orm';
import type {
  DrizzleCryptoWalletAddress,
  DrizzleNewCryptoWalletAddress,
} from '../../schemas/sqlite/index.js';
import { cryptoWalletAddresses } from '../../schemas/sqlite/index.js';
import { BaseRepository } from './base.js';
import type { PaginationOptions } from '../../../types/models.js';

/**
 * MonetizationRepository class for crypto wallet CRUD operations
 */
export class MonetizationRepository extends BaseRepository {
  /**
   * Finds a wallet address by its wallet_address_id
   *
   * @param walletAddressId - The wallet address primary key
   * @returns The wallet record or null if not found
   */
  async findById(walletAddressId: number): Promise<DrizzleCryptoWalletAddress | null> {
    const result = await this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address_id, walletAddressId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all wallet addresses with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of wallet addresses
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleCryptoWalletAddress[]> {
    const { limit } = this.getPaginationParams(options);

    const query = this.db
      .select()
      .from(cryptoWalletAddresses)
      .orderBy(desc(cryptoWalletAddresses.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all wallet addresses for a specific chain
   *
   * @param chain - The blockchain chain name
   * @param options - Pagination options
   * @returns Array of wallet addresses for the chain
   */
  async findByChain(
    chain: string,
    options?: PaginationOptions
  ): Promise<DrizzleCryptoWalletAddress[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.chain, chain))
      .orderBy(desc(cryptoWalletAddresses.timestamp))
      .limit(limit);
  }

  /**
   * Finds a wallet by its address string
   *
   * @param walletAddress - The wallet address string
   * @returns The wallet record or null if not found
   */
  async findByAddress(walletAddress: string): Promise<DrizzleCryptoWalletAddress | null> {
    const result = await this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address, walletAddress))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total wallet addresses
   *
   * @returns Total count of wallet addresses
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(cryptoWalletAddresses);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new wallet address record
   *
   * @param data - Wallet data for insertion
   * @returns The created wallet record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewCryptoWalletAddress): Promise<DrizzleCryptoWalletAddress> {
    const result = await this.db.insert(cryptoWalletAddresses).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create crypto wallet address record');
    }
    return result[0];
  }

  /**
   * Updates a wallet address record
   *
   * @param walletAddressId - The wallet address primary key
   * @param data - Partial wallet data to update
   * @returns The updated wallet record or null if not found
   */
  async update(
    walletAddressId: number,
    data: Partial<DrizzleNewCryptoWalletAddress>
  ): Promise<DrizzleCryptoWalletAddress | null> {
    const result = await this.db
      .update(cryptoWalletAddresses)
      .set(data)
      .where(eq(cryptoWalletAddresses.wallet_address_id, walletAddressId))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a wallet address record
   *
   * @param walletAddressId - The wallet address primary key
   * @returns true if deleted, false if not found
   */
  async delete(walletAddressId: number): Promise<boolean> {
    const result = await this.db
      .delete(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address_id, walletAddressId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all wallet addresses for a specific chain
   *
   * @param chain - The blockchain chain name
   * @returns Number of deleted wallet addresses
   */
  async deleteByChain(chain: string): Promise<number> {
    const result = await this.db
      .delete(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.chain, chain))
      .returning();
    return result.length;
  }

  /**
   * Checks if a wallet address already exists
   *
   * @param walletAddress - The wallet address string to check
   * @returns true if the address exists, false otherwise
   */
  async exists(walletAddress: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address, walletAddress));
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Deletes all crypto wallet address records
   *
   * @returns Number of deleted wallet addresses
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(cryptoWalletAddresses).returning();
    return result.length;
  }

  /**
   * Creates multiple crypto wallet address records in bulk
   *
   * @param data - Array of wallet address data for insertion
   * @returns Array of created wallet address records
   */
  async createMany(data: DrizzleNewCryptoWalletAddress[]): Promise<DrizzleCryptoWalletAddress[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(cryptoWalletAddresses).values(data).returning();
  }
}
