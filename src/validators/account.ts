/**
 * Account Request Validators
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
  booleanSchema,
} from './common.schemas.js';

/**
 * Sign in request body schema
 */
export const signInBodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  moarTubeNodeHttpProtocol: protocolSchema,
  moarTubeNodeIp: addressSchema,
  moarTubeNodePort: portSchema,
  rememberMe: booleanSchema.optional().default(false),
});

export type SignInBody = z.infer<typeof signInBodySchema>;
