import { eq, desc, count } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IMonetizationRepository } from './interface.js';
import type {
  DrizzleCryptoWalletAddress,
  DrizzleNewCryptoWalletAddress,
} from '@/database/schemas/postgres/monetization.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { cryptoWalletAddresses } from '@/database/schemas/postgres/monetization.js';

export class MonetizationRepositoryPostgres implements IMonetizationRepository<
  DrizzleCryptoWalletAddress,
  DrizzleNewCryptoWalletAddress
> {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async findById(walletAddressId: number): Promise<DrizzleCryptoWalletAddress | null> {
    const result = await this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address_id, walletAddressId))
      .limit(1);
    return result[0] ?? null;
  }

  async findAll(options?: PaginationOptions): Promise<DrizzleCryptoWalletAddress[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db
      .select()
      .from(cryptoWalletAddresses)
      .orderBy(desc(cryptoWalletAddresses.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  async findByChain(
    chain: string,
    options?: PaginationOptions
  ): Promise<DrizzleCryptoWalletAddress[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.chain, chain))
      .orderBy(desc(cryptoWalletAddresses.timestamp))
      .limit(limit);
  }

  async findByAddress(walletAddress: string): Promise<DrizzleCryptoWalletAddress | null> {
    const result = await this.db
      .select()
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address, walletAddress))
      .limit(1);
    return result[0] ?? null;
  }

  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(cryptoWalletAddresses);
    return result[0]?.count ?? 0;
  }

  async create(data: DrizzleNewCryptoWalletAddress): Promise<DrizzleCryptoWalletAddress> {
    const result = await this.db.insert(cryptoWalletAddresses).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create crypto wallet address record');
    }
    return result[0];
  }

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

  async delete(walletAddressId: number): Promise<boolean> {
    const result = await this.db
      .delete(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address_id, walletAddressId))
      .returning();
    return result.length > 0;
  }

  async deleteByChain(chain: string): Promise<number> {
    const result = await this.db
      .delete(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.chain, chain))
      .returning();
    return result.length;
  }

  async exists(walletAddress: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(cryptoWalletAddresses)
      .where(eq(cryptoWalletAddresses.wallet_address, walletAddress));
    return (result[0]?.count ?? 0) > 0;
  }

  async deleteAll(): Promise<number> {
    const result = await this.db.delete(cryptoWalletAddresses).returning();
    return result.length;
  }

  async createMany(data: DrizzleNewCryptoWalletAddress[]): Promise<DrizzleCryptoWalletAddress[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(cryptoWalletAddresses).values(data).returning();
  }
}
