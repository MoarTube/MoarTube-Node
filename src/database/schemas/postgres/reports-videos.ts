/**
 * Video reports table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents reports filed against videos.
 * This schema matches the existing Sequelize VideoReport model for backward compatibility.
 */
import { pgTable, serial, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Video reports table for storing reports against videos
 */
export const videoReports = pgTable('videoreports', {
  // Primary key - auto-incrementing integer
  report_id: serial('report_id').primaryKey(),

  // Timestamp when the report was filed
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),

  // Timestamp when the video was created
  video_timestamp: bigint('video_timestamp', { mode: 'number' }).notNull(),

  // Reference to the reported video
  video_id: text('video_id').notNull(),

  // Reporter's email address
  email: text('email').notNull(),

  // Type of report (spam, harassment, copyright, etc.)
  type: text('type').notNull(),

  // Detailed report message
  message: text('message').notNull(),
});

/**
 * Inferred types from the video reports table schema
 */
export type DrizzleVideoReport = typeof videoReports.$inferSelect;
export type DrizzleNewVideoReport = typeof videoReports.$inferInsert;