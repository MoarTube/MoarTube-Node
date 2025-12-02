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
  chain: z.string().min(1, 'Chain is required').max(50),
  address: z.string().min(1, 'Address is required').max(200),
});

export type AddWalletAddressBody = z.infer<typeof addWalletAddressBodySchema>;

/**
 * Delete wallet address request body schema
 */
export const deleteWalletAddressBodySchema = z.object({
  cryptoWalletAddressId: z.coerce.number().int().positive(),
});

export type DeleteWalletAddressBody = z.infer<typeof deleteWalletAddressBodySchema>;
