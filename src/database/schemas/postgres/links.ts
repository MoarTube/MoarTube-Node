/**
 * Links table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents social/external links displayed on the node.
 * This schema matches the existing Sequelize Links model for backward compatibility.
 */
import { pgTable, serial, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Links table for storing social/external links
 */
export const links = pgTable('links', {
  // Primary key - auto-incrementing integer
  link_id: serial('link_id').primaryKey(),

  // The full URL of the link
  url: text('url').notNull(),

  // SVG graphic markup for the link icon
  svg_graphic: text('svg_graphic').notNull(),

  // Unix timestamp of link creation
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

/**
 * Inferred types from the links table schema
 */
export type DrizzleLink = typeof links.$inferSelect;
export type DrizzleNewLink = typeof links.$inferInsert;