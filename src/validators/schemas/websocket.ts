/**
 * WebSocket Message Zod Schemas
 *
 * Validation schemas for WebSocket messages in MoarTube-Node
 */
import { z } from 'zod';
import { videoIdSchema, timestampSchema, cloudflareTurnstileTokenSchema } from './common.js';

// ============================================================================
// Chat Message Schemas
// ============================================================================

/**
 * Chat message content schema - sanitized text with length limits
 */
export const chatMessageContentSchema = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(500, 'Message must be less than 500 characters')
  .transform((val) => val.trim())
  .refine((val) => val.length > 0, 'Message cannot be empty after trimming');

/**
 * Chat join event schema
 */
export const chatJoinEventSchema = z.object({
  eventName: z.literal('chat'),
  type: z.literal('join'),
  videoId: videoIdSchema,
});

/**
 * Chat message event schema
 */
export const chatMessageEventSchema = z.object({
  eventName: z.literal('chat'),
  type: z.literal('message'),
  videoId: videoIdSchema,
  chatMessageContent: chatMessageContentSchema,
  sentTimestamp: timestampSchema,
  cloudflareTurnstileToken: cloudflareTurnstileTokenSchema,
});

// ============================================================================
// Registration Schemas
// ============================================================================

/**
 * Register event schema
 */
export const registerEventSchema = z.object({
  eventName: z.literal('register'),
  socketType: z.enum(['moartube_client', 'admin', 'viewer', 'node_peer']),
  jwtToken: z.string().optional(),
});

// ============================================================================
// Echo Schemas
// ============================================================================

/**
 * Echo event schema
 */
export const echoEventSchema = z.object({
  eventName: z.literal('echo'),
  data: z.object({
    eventName: z.string().min(1),
    payload: z.unknown(),
  }),
});

// ============================================================================
// Video Status Schemas
// ============================================================================
export const videoStatusEventSchema = z.object({
  eventName: z.enum([
    'video_importing',
    'video_imported',
    'video_publishing',
    'video_published',
    'video_error',
    'video_finalized',
    'video_status',
    'video_data',
  ]),
  videoId: videoIdSchema.optional(),
});

export type ChatJoinEvent = z.infer<typeof chatJoinEventSchema>;
export type ChatMessageEvent = z.infer<typeof chatMessageEventSchema>;
export type VideoStatusEvent = z.infer<typeof videoStatusEventSchema>;
export type RegisterEvent = z.infer<typeof registerEventSchema>;
export type EchoEvent = z.infer<typeof echoEventSchema>;
