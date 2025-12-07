/**
 * Videos table schema definition for Drizzle ORM
 *
 * Represents video records including published videos and live streams.
 * This schema matches the existing Sequelize Video model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Videos table for storing video metadata and state
 */
export const videos = sqliteTable('videos', {
  // Primary key - auto-incrementing integer
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Unique video identifier (used in URLs)
  video_id: text('video_id').notNull(),

  // Source file information
  source_file_extension: text('source_file_extension').notNull(),

  // Content metadata
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').notNull(),

  // Duration
  length_seconds: integer('length_seconds').notNull(),
  length_timestamp: text('length_timestamp').notNull(),

  // Statistics
  views: integer('views').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  dislikes: integer('dislikes').notNull().default(0),
  bandwidth: integer('bandwidth').notNull().default(0),

  // Import state
  is_importing: integer('is_importing', { mode: 'boolean' }).notNull().default(false),
  is_imported: integer('is_imported', { mode: 'boolean' }).notNull().default(false),

  // Publish state
  is_publishing: integer('is_publishing', { mode: 'boolean' }).notNull().default(false),
  is_published: integer('is_published', { mode: 'boolean' }).notNull().default(false),

  // Streaming state
  is_streaming: integer('is_streaming', { mode: 'boolean' }).notNull().default(false),
  is_streamed: integer('is_streamed', { mode: 'boolean' }).notNull().default(false),
  is_stream_recorded_remotely: integer('is_stream_recorded_remotely', { mode: 'boolean' })
    .notNull()
    .default(false),
  is_stream_recorded_locally: integer('is_stream_recorded_locally', { mode: 'boolean' })
    .notNull()
    .default(false),
  is_live: integer('is_live', { mode: 'boolean' }).notNull().default(false),

  // Indexing state
  is_indexing: integer('is_indexing', { mode: 'boolean' }).notNull().default(false),
  is_indexed: integer('is_indexed', { mode: 'boolean' }).notNull().default(false),
  is_index_outdated: integer('is_index_outdated', { mode: 'boolean' }).notNull().default(false),

  // Status flags
  is_error: integer('is_error', { mode: 'boolean' }).notNull().default(false),
  is_finalized: integer('is_finalized', { mode: 'boolean' }).notNull().default(false),
  is_hidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),

  // Password protection
  is_passworded: integer('is_passworded', { mode: 'boolean' }).notNull().default(false),
  password: text('password').notNull().default(''),

  // Feature toggles
  is_comments_enabled: integer('is_comments_enabled', { mode: 'boolean' }).notNull().default(true),
  is_likes_enabled: integer('is_likes_enabled', { mode: 'boolean' }).notNull().default(true),
  is_dislikes_enabled: integer('is_dislikes_enabled', { mode: 'boolean' }).notNull().default(true),
  is_reports_enabled: integer('is_reports_enabled', { mode: 'boolean' }).notNull().default(true),
  is_live_chat_enabled: integer('is_live_chat_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),

  // JSON data (stored as text)
  outputs: text('outputs').notNull().default('{}'),
  meta: text('meta').notNull().default('{}'),

  // Timestamp
  creation_timestamp: integer('creation_timestamp').notNull(),
});

/**
 * Inferred types from the videos table schema
 */
export type DrizzleVideo = typeof videos.$inferSelect;
export type DrizzleNewVideo = typeof videos.$inferInsert;
