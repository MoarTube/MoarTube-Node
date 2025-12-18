/**
 * Videos table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents video records including published videos and live streams.
 * This schema matches the existing Sequelize Video model for backward compatibility.
 */
import { pgTable, serial, text, integer, boolean, bigint } from 'drizzle-orm/pg-core';

/**
 * Videos table for storing video metadata and state
 */
export const videos = pgTable('videos', {
  // Primary key - auto-incrementing integer
  id: serial('id').primaryKey(),

  // Unique video identifier (used in URLs)
  video_id: text('video_id').notNull(),

  // Source file information
  source_file_extension: text('source_file_extension'),

  // Content metadata
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').notNull(),

  // Duration
  length_seconds: integer('length_seconds').notNull(),
  length_timestamp: text('length_timestamp'),

  // Statistics
  views: integer('views').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  dislikes: integer('dislikes').notNull().default(0),
  bandwidth: integer('bandwidth').notNull().default(0),

  // Import state
  is_importing: boolean('is_importing').notNull().default(false),
  is_imported: boolean('is_imported').notNull().default(false),

  // Publish state
  is_publishing: boolean('is_publishing').notNull().default(false),
  is_published: boolean('is_published').notNull().default(false),

  // Streaming state
  is_streaming: boolean('is_streaming').notNull().default(false),
  is_streamed: boolean('is_streamed').notNull().default(false),
  is_stream_recorded_remotely: boolean('is_stream_recorded_remotely').notNull().default(false),
  is_stream_recorded_locally: boolean('is_stream_recorded_locally').notNull().default(false),
  is_live: boolean('is_live').notNull().default(false),

  // Indexing state
  is_indexing: boolean('is_indexing').notNull().default(false),
  is_indexed: boolean('is_indexed').notNull().default(false),
  is_index_outdated: boolean('is_index_outdated').notNull().default(false),

  // Status flags
  is_error: boolean('is_error').notNull().default(false),
  is_finalized: boolean('is_finalized').notNull().default(false),
  is_hidden: boolean('is_hidden').notNull().default(false),

  // Password protection
  is_passworded: boolean('is_passworded').notNull().default(false),
  password: text('password').notNull().default(''),

  // Feature toggles
  is_comments_enabled: boolean('is_comments_enabled').notNull().default(true),
  is_likes_enabled: boolean('is_likes_enabled').notNull().default(true),
  is_dislikes_enabled: boolean('is_dislikes_enabled').notNull().default(true),
  is_reports_enabled: boolean('is_reports_enabled').notNull().default(true),
  is_live_chat_enabled: boolean('is_live_chat_enabled').notNull().default(true),

  // JSON data (stored as text)
  outputs: text('outputs').notNull().default('{}'),
  meta: text('meta').notNull().default('{}'),

  // Timestamp
  creation_timestamp: bigint('creation_timestamp', { mode: 'number' }).notNull(),
});

/**
 * Inferred types from the videos table schema
 */
export type DrizzleVideo = typeof videos.$inferSelect;
export type DrizzleNewVideo = typeof videos.$inferInsert;