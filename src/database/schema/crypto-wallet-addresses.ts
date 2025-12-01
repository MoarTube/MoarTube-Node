/**
 * Crypto wallet addresses table schema definition for Drizzle ORM
 *
 * Represents cryptocurrency wallet addresses for donations/tips.
 * This schema matches the existing Sequelize CryptoWalletAddresses model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Crypto wallet addresses table for storing monetization wallet addresses
 */
export const cryptoWalletAddresses = sqliteTable('cryptowalletaddresses', {
  // Primary key - auto-incrementing integer
  walletAddressId: integer('wallet_address_id').primaryKey({ autoIncrement: true }),

  // The wallet address string
  walletAddress: text('wallet_address').notNull(),

  // Blockchain chain name (e.g., "Ethereum", "Bitcoin")
  chain: text('chain').notNull(),

  // Chain ID (e.g., "1" for Ethereum mainnet)
  chainId: text('chain_id').notNull(),

  // Currency symbol (e.g., "ETH", "BTC")
  currency: text('currency').notNull(),

  // Unix timestamp of address creation
  timestamp: integer('timestamp').notNull(),
});

/**
 * Inferred types from the crypto wallet addresses table schema
 */
export type DrizzleCryptoWalletAddress = typeof cryptoWalletAddresses.$inferSelect;
export type DrizzleNewCryptoWalletAddress = typeof cryptoWalletAddresses.$inferInsert;
