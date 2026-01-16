import { eq, desc, count } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { ILinksRepository } from './interface.js';
import type { DrizzleLink, DrizzleNewLink } from '@/database/schemas/postgres/links.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { links } from '@/database/schemas/postgres/links.js';

export class LinksRepositoryPostgres implements ILinksRepository<DrizzleLink, DrizzleNewLink> {
  private readonly db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async findById(linkId: number): Promise<DrizzleLink | null> {
    const result = await this.db
      .select()
      .from(links)
      .where(eq(links.link_id, linkId))
      .limit(1);
    return result[0] ?? null;
  }

  async findAll(options?: PaginationOptions): Promise<DrizzleLink[]> {
    const limit = options?.limit;

    const query = this.db.select().from(links).orderBy(desc(links.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  async findByUrl(url: string): Promise<DrizzleLink | null> {
    const result = await this.db
      .select()
      .from(links)
      .where(eq(links.url, url))
      .limit(1);
    return result[0] ?? null;
  }

  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(links);
    return result[0]?.count ?? 0;
  }

  async create(data: DrizzleNewLink): Promise<DrizzleLink> {
    const result = await this.db.insert(links).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create link record');
    }
    return result[0];
  }

  async update(linkId: number, data: Partial<DrizzleNewLink>): Promise<DrizzleLink | null> {
    const result = await this.db
      .update(links)
      .set(data)
      .where(eq(links.link_id, linkId))
      .returning();
    return result[0] ?? null;
  }

  async delete(linkId: number): Promise<boolean> {
    const result = await this.db
      .delete(links)
      .where(eq(links.link_id, linkId))
      .returning();
    return result.length > 0;
  }

  async deleteAll(): Promise<number> {
    const result = await this.db.delete(links).returning();
    return result.length;
  }

  async createMany(data: DrizzleNewLink[]): Promise<DrizzleLink[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(links).values(data).returning();
  }

  async existsByUrl(url: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(links)
      .where(eq(links.url, url));
    return (result[0]?.count ?? 0) > 0;
  }
}