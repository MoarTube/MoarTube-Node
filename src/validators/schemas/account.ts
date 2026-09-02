/**
 * Account Request Schemas
 *
 * Zod schemas for account-related API endpoints.
 */
import { z } from 'zod';
import {
  usernameSchema,
  passwordSchema,
  protocolSchema,
  addressSchema,
  portSchema,
} from '@validators/schemas/common.js';

/**
 * Sign in request body schema
 */
export const signInBodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  moarTubeNodeHttpProtocol: protocolSchema,
  moarTubeNodeIp: addressSchema,
  moarTubeNodePort: portSchema,
});

export type SignInBody = z.infer<typeof signInBodySchema>;
