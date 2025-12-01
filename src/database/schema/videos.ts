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
  videoId: text('video_id').notNull(),

  // Source file information
  sourceFileExtension: text('source_file_extension').notNull(),

  // Content metadata
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').notNull(),

  // Duration
  lengthSeconds: integer('length_seconds').notNull(),
  lengthTimestamp: text('length_timestamp').notNull(),

  // Statistics
  views: integer('views').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  dislikes: integer('dislikes').notNull().default(0),
  bandwidth: integer('bandwidth').notNull().default(0),

  // Import state
  isImporting: integer('is_importing', { mode: 'boolean' }).notNull().default(false),
  isImported: integer('is_imported', { mode: 'boolean' }).notNull().default(false),

  // Publish state
  isPublishing: integer('is_publishing', { mode: 'boolean' }).notNull().default(false),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),

  // Streaming state
  isStreaming: integer('is_streaming', { mode: 'boolean' }).notNull().default(false),
  isStreamed: integer('is_streamed', { mode: 'boolean' }).notNull().default(false),
  isStreamRecordedRemotely: integer('is_stream_recorded_remotely', { mode: 'boolean' })
    .notNull()
    .default(false),
  isStreamRecordedLocally: integer('is_stream_recorded_locally', { mode: 'boolean' })
    .notNull()
    .default(false),
  isLive: integer('is_live', { mode: 'boolean' }).notNull().default(false),

  // Indexing state
  isIndexing: integer('is_indexing', { mode: 'boolean' }).notNull().default(false),
  isIndexed: integer('is_indexed', { mode: 'boolean' }).notNull().default(false),
  isIndexOutdated: integer('is_index_outdated', { mode: 'boolean' }).notNull().default(false),

  // Status flags
  isError: integer('is_error', { mode: 'boolean' }).notNull().default(false),
  isFinalized: integer('is_finalized', { mode: 'boolean' }).notNull().default(false),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),

  // Password protection
  isPassworded: integer('is_passworded', { mode: 'boolean' }).notNull().default(false),
  password: text('password').notNull().default(''),

  // Feature toggles
  isCommentsEnabled: integer('is_comments_enabled', { mode: 'boolean' }).notNull().default(true),
  isLikesEnabled: integer('is_likes_enabled', { mode: 'boolean' }).notNull().default(true),
  isDislikesEnabled: integer('is_dislikes_enabled', { mode: 'boolean' }).notNull().default(true),
  isReportsEnabled: integer('is_reports_enabled', { mode: 'boolean' }).notNull().default(true),
  isLiveChatEnabled: integer('is_live_chat_enabled', { mode: 'boolean' }).notNull().default(true),

  // JSON data (stored as text)
  outputs: text('outputs').notNull().default('{}'),
  meta: text('meta').notNull().default('{}'),

  // Timestamp
  creationTimestamp: integer('creation_timestamp').notNull(),
});

/**
 * Inferred types from the videos table schema
 */
export type DrizzleVideo = typeof videos.$inferSelect;
export type DrizzleNewVideo = typeof videos.$inferInsert;
