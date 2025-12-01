/**
 * Links table schema definition for Drizzle ORM
 *
 * Represents social/external links displayed on the node.
 * This schema matches the existing Sequelize Links model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Links table for storing social/external links
 */
export const links = sqliteTable('links', {
  // Primary key - auto-incrementing integer
  linkId: integer('link_id').primaryKey({ autoIncrement: true }),

  // The full URL of the link
  url: text('url').notNull(),

  // SVG graphic markup for the link icon
  svgGraphic: text('svg_graphic').notNull(),

  // Unix timestamp of link creation
  timestamp: integer('timestamp').notNull(),
});

/**
 * Inferred types from the links table schema
 */
export type DrizzleLink = typeof links.$inferSelect;
export type DrizzleNewLink = typeof links.$inferInsert;
