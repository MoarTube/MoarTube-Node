/**
 * Links Repository Interface
 *
 * Defines the contract for social/external link data access operations.
 */
import type { PaginationOptions } from '@/types/index.js';

export interface ILinksRepository<LinkType, NewLinkType> {
  /**
   * Finds a link by its link_id
   *
   * @param linkId - The link primary key
   * @returns The link record or null if not found
   */
  findById(linkId: number): Promise<LinkType | null>;

  /**
   * Finds all links with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of links
   */
  findAll(options?: PaginationOptions): Promise<LinkType[]>;

  /**
   * Finds a link by its URL
   *
   * @param url - The URL to search for
   * @returns The link record or null if not found
   */
  findByUrl(url: string): Promise<LinkType | null>;

  /**
   * Counts total links
   *
   * @returns Total count of links
   */
  getCount(): Promise<number>;

  /**
   * Creates a new link record
   *
   * @param data - Link data for insertion
   * @returns The created link record
   */
  create(data: NewLinkType): Promise<LinkType>;

  /**
   * Updates a link record
   *
   * @param linkId - The link primary key
   * @param data - Partial link data to update
   * @returns The updated link record or null if not found
   */
  update(linkId: number, data: Partial<NewLinkType>): Promise<LinkType | null>;

  /**
   * Deletes a link record
   *
   * @param linkId - The link primary key
   * @returns true if deleted, false if not found
   */
  delete(linkId: number): Promise<boolean>;

  /**
   * Deletes all links
   *
   * @returns Number of deleted links
   */
  deleteAll(): Promise<number>;

  /**
   * Creates multiple link records in bulk
   *
   * @param data - Array of link data for insertion
   * @returns Array of created link records
   */
  createMany(data: NewLinkType[]): Promise<LinkType[]>;

  /**
   * Checks if a URL already exists
   *
   * @param url - The URL to check
   * @returns true if the URL exists, false otherwise
   */
  existsByUrl(url: string): Promise<boolean>;
}