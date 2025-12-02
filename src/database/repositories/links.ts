/**
 * Links Repository
 *
 * Provides data access methods for social link records using Drizzle ORM.
 */
import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleLink, DrizzleNewLink } from '../schema';
import { links } from '../schema';
import { BaseRepository } from './base';
import type { PaginationOptions } from '../../types/models';

/**
 * LinksRepository class for link CRUD operations
 */
export class LinksRepository extends BaseRepository {
  /**
   * Finds a link by its link_id
   *
   * @param linkId - The link primary key
   * @returns The link record or null if not found
   */
  async findById(linkId: number): Promise<DrizzleLink | null> {
    const result = await this.db.select().from(links).where(eq(links.linkId, linkId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all links with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of links
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleLink[]> {
    const { limit, offset } = this.getPaginationParams(options);

    const query = this.db.select().from(links).orderBy(desc(links.timestamp));

    if (limit !== undefined) {
      return query.limit(limit).offset(offset);
    }

    return query.offset(offset);
  }

  /**
   * Finds a link by its URL
   *
   * @param url - The URL to search for
   * @returns The link record or null if not found
   */
  async findByUrl(url: string): Promise<DrizzleLink | null> {
    const result = await this.db.select().from(links).where(eq(links.url, url)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total links
   *
   * @returns Total count of links
   */
  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(links);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new link record
   *
   * @param data - Link data for insertion
   * @returns The created link record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewLink): Promise<DrizzleLink> {
    const result = await this.db.insert(links).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create link record');
    }
    return result[0];
  }

  /**
   * Updates a link record
   *
   * @param linkId - The link primary key
   * @param data - Partial link data to update
   * @returns The updated link record or null if not found
   */
  async update(linkId: number, data: Partial<DrizzleNewLink>): Promise<DrizzleLink | null> {
    const result = await this.db
      .update(links)
      .set(data)
      .where(eq(links.linkId, linkId))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a link record
   *
   * @param linkId - The link primary key
   * @returns true if deleted, false if not found
   */
  async delete(linkId: number): Promise<boolean> {
    const result = await this.db.delete(links).where(eq(links.linkId, linkId)).returning();
    return result.length > 0;
  }

  /**
   * Deletes all links
   *
   * @returns Number of deleted links
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(links).returning();
    return result.length;
  }

  /**
   * Creates multiple link records in bulk
   *
   * @param data - Array of link data for insertion
   * @returns Array of created link records
   */
  async createMany(data: DrizzleNewLink[]): Promise<DrizzleLink[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(links).values(data).returning();
  }

  /**
   * Checks if a URL already exists
   *
   * @param url - The URL to check
   * @returns true if the URL exists, false otherwise
   */
  async existsByUrl(url: string): Promise<boolean> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(links)
      .where(eq(links.url, url));
    return (result[0]?.count ?? 0) > 0;
  }
}
