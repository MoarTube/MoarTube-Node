/**
 * Crypto wallet addresses table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents cryptocurrency wallet addresses for donations/tips.
 * This schema matches the existing Sequelize CryptoWalletAddresses model for backward compatibility.
 */
import { pgTable, serial, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Crypto wallet addresses table for storing monetization wallet addresses
 */
export const cryptoWalletAddresses = pgTable('cryptowalletaddresses', {
  // Primary key - auto-incrementing integer
  wallet_address_id: serial('wallet_address_id').primaryKey(),

  // The wallet address string
  wallet_address: text('wallet_address').notNull(),

  // Blockchain chain name (e.g., "Ethereum", "Bitcoin")
  chain: text('chain').notNull(),

  // Chain ID (e.g., "1" for Ethereum mainnet)
  chain_id: text('chain_id').notNull(),

  // Currency symbol (e.g., "ETH", "BTC")
  currency: text('currency').notNull(),

  // Unix timestamp of address creation
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

/**
 * Inferred types from the crypto wallet addresses table schema
 */
export type DrizzleCryptoWalletAddress = typeof cryptoWalletAddresses.$inferSelect;
export type DrizzleNewCryptoWalletAddress = typeof cryptoWalletAddresses.$inferInsert;
