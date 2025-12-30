/**
 * Monetization Request Schemas
 *
 * Zod schemas for crypto wallet address API endpoints.
 */
import { z } from 'zod';
import { idSchema } from '@validators/schemas/common.js';

// ============================================================================
// Monetization-Specific Schemas
// ============================================================================

/**
 * Wallet address schema
 */
export const walletAddressSchema = z
  .string()
  .min(1, 'Wallet address is required')
  .max(200, 'Wallet address must be less than 200 characters');

/**
 * Chain schema
 */
export const chainSchema = z
  .string()
  .min(1, 'Chain is required')
  .max(50, 'Chain must be less than 50 characters');

/**
 * Currency schema
 */
export const currencySchema = z
  .string()
  .min(1, 'Currency is required')
  .max(10, 'Currency must be less than 10 characters');

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Add wallet address request body schema
 */
export const addWalletAddressBodySchema = z.object({
  walletAddress: walletAddressSchema,
  chain: chainSchema,
  currency: currencySchema,
});

export type AddWalletAddressBody = z.infer<typeof addWalletAddressBodySchema>;

/**
 * Delete wallet address request body schema
 */
export const deleteWalletAddressBodySchema = z.object({
  cryptoWalletAddressId: idSchema,
});

export type DeleteWalletAddressBody = z.infer<typeof deleteWalletAddressBodySchema>;
