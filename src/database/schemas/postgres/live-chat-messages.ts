/**
 * Live chat messages table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents live chat messages during video streams.
 * This schema matches the existing Sequelize LiveChatMessages model for backward compatibility.
 */
import { pgTable, serial, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Live chat messages table for storing chat messages during streams
 */
export const liveChatMessages = pgTable('livechatmessages', {
  // Primary key - auto-incrementing integer
  chat_message_id: serial('chat_message_id').primaryKey(),

  // Reference to the video/stream this message belongs to
  video_id: text('video_id').notNull(),

  // Username of the message sender
  username: text('username').notNull(),

  // Hex color code for the username display
  username_color_hex_code: text('username_color_hex_code').notNull(),

  // The chat message content
  chat_message: text('chat_message').notNull(),

  // Unix timestamp of message creation
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

/**
 * Inferred types from the live chat messages table schema
 */
export type DrizzleLiveChatMessage = typeof liveChatMessages.$inferSelect;
export type DrizzleNewLiveChatMessage = typeof liveChatMessages.$inferInsert;
