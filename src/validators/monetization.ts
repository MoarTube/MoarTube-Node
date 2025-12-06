/**
 * Monetization Request Validators
 *
 * Zod schemas for crypto wallet address API endpoints.
 */
import { z } from 'zod';

// ============================================================================
// Request Body Schemas
// ============================================================================

/**
 * Add wallet address request body schema
 */
export const addWalletAddressBodySchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required').max(200),
  chain: z.string().min(1, 'Chain is required').max(50),
  currency: z.string().min(1, 'Currency is required').max(10),
});

export type AddWalletAddressBody = z.infer<typeof addWalletAddressBodySchema>;

/**
 * Delete wallet address request body schema
 */
export const deleteWalletAddressBodySchema = z.object({
  cryptoWalletAddressId: z.coerce.number().int().positive(),
});

export type DeleteWalletAddressBody = z.infer<typeof deleteWalletAddressBodySchema>;
