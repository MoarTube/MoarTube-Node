/**
 * this.linksTable Repository
 *
 * Provides data access methods for social link records using Drizzle ORM.
 */
import { eq, desc, count } from 'drizzle-orm';
import { BaseRepository } from './base.js';
import type { PaginationOptions } from '../../types/models.js';

/**
 * LinksRepository class for link CRUD operations
 */
export class LinksRepository extends BaseRepository {
  constructor(db: any, private readonly linksTable: any) {
    super(db);
  }
  /**
   * Finds a link by its link_id
   *
   * @param linkId - The link primary key
   * @returns The link record or null if not found
   */
  async findById(linkId: number): Promise<any | null> {
    const result = await this.db.select().from(this.linksTable).where(eq(this.linksTable.link_id, linkId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all this.linksTable with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of this.linksTable
   */
  async findAll(options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParams(options);

    const query = this.db.select().from(this.linksTable).orderBy(desc(this.linksTable.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds a link by its URL
   *
   * @param url - The URL to search for
   * @returns The link record or null if not found
   */
  async findByUrl(url: string): Promise<any | null> {
    const result = await this.db.select().from(this.linksTable).where(eq(this.linksTable.url, url)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total this.linksTable
   *
   * @returns Total count of this.linksTable
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(this.linksTable);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new link record
   *
   * @param data - Link data for insertion
   * @returns The created link record
   * @throws Error if insert fails to return a record
   */
  async create(data: any): Promise<any> {
    const result = await this.db.insert(this.linksTable).values(data).returning();
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
  async update(linkId: number, data: Partial<any>): Promise<any | null> {
    const result = await this.db
      .update(this.linksTable)
      .set(data)
      .where(eq(this.linksTable.link_id, linkId))
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
    const result = await this.db.delete(this.linksTable).where(eq(this.linksTable.link_id, linkId)).returning();
    return result.length > 0;
  }

  /**
   * Deletes all this.linksTable
   *
   * @returns Number of deleted this.linksTable
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(this.linksTable).returning();
    return result.length;
  }

  /**
   * Creates multiple link records in bulk
   *
   * @param data - Array of link data for insertion
   * @returns Array of created link records
   */
  async createMany(data: any[]): Promise<any[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.linksTable).values(data).returning();
  }

  /**
   * Checks if a URL already exists
   *
   * @param url - The URL to check
   * @returns true if the URL exists, false otherwise
   */
  async existsByUrl(url: string): Promise<boolean> {
    const result = await this.db.select({ count: count() }).from(this.linksTable).where(eq(this.linksTable.url, url));
    return (result[0]?.count ?? 0) > 0;
  }
}
