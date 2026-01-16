/**
 * Monetization Repository Interface
 *
 * Defines the contract for crypto wallet address data access operations.
 */
import type { PaginationOptions } from '@/types/index.js';

export interface IMonetizationRepository<WalletType, NewWalletType> {
  /**
   * Finds a wallet address by its wallet_address_id
   *
   * @param walletAddressId - The wallet address primary key
   * @returns The wallet record or null if not found
   */
  findById(walletAddressId: number): Promise<WalletType | null>;

  /**
   * Finds all wallet addresses with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of wallet addresses
   */
  findAll(options?: PaginationOptions): Promise<WalletType[]>;

  /**
   * Finds all wallet addresses for a specific chain
   *
   * @param chain - The blockchain chain name
   * @param options - Pagination options
   * @returns Array of wallet addresses for the chain
   */
  findByChain(chain: string, options?: PaginationOptions): Promise<WalletType[]>;

  /**
   * Finds a wallet by its address string
   *
   * @param walletAddress - The wallet address string
   * @returns The wallet record or null if not found
   */
  findByAddress(walletAddress: string): Promise<WalletType | null>;

  /**
   * Counts total wallet addresses
   *
   * @returns Total count of wallet addresses
   */
  getCount(): Promise<number>;

  /**
   * Creates a new wallet address record
   *
   * @param data - Wallet data for insertion
   * @returns The created wallet record
   */
  create(data: NewWalletType): Promise<WalletType>;

  /**
   * Updates a wallet address record
   *
   * @param walletAddressId - The wallet address primary key
   * @param data - Partial wallet data to update
   * @returns The updated wallet record or null if not found
   */
  update(walletAddressId: number, data: Partial<NewWalletType>): Promise<WalletType | null>;

  /**
   * Deletes a wallet address record
   *
   * @param walletAddressId - The wallet address primary key
   * @returns true if deleted, false if not found
   */
  delete(walletAddressId: number): Promise<boolean>;

  /**
   * Deletes all wallet addresses for a specific chain
   *
   * @param chain - The blockchain chain name
   * @returns Number of deleted wallet addresses
   */
  deleteByChain(chain: string): Promise<number>;

  /**
   * Checks if a wallet address already exists
   *
   * @param walletAddress - The wallet address string to check
   * @returns true if the address exists, false otherwise
   */
  exists(walletAddress: string): Promise<boolean>;

  /**
   * Deletes all crypto wallet address records
   *
   * @returns Number of deleted wallet addresses
   */
  deleteAll(): Promise<number>;

  /**
   * Creates multiple crypto wallet address records in bulk
   *
   * @param data - Array of wallet address data for insertion
   * @returns Array of created wallet address records
   */
  createMany(data: NewWalletType[]): Promise<WalletType[]>;
}
