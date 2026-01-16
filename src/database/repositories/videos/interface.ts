import type { PaginationOptions } from '@/types/index.js';

/**
 * Options for querying videos
 */
export interface VideoQueryOptions extends PaginationOptions {
  /** Sort field */
  sortBy?: 'creation_timestamp' | 'views' | 'likes' | 'title';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Filter by published status */
  isPublished?: boolean;
  /** Filter by streaming status */
  isStreaming?: boolean;
  /** Filter by finalized status */
  isFinalized?: boolean;
  /** Search in title, description, or tags */
  search?: string;
  /** Filter by specific tag */
  tagTerm?: string;
  /** Timestamp for pagination */
  timestamp?: number;
}

export interface IVideosRepository<VideoType, NewVideoType> {
  findById(videoId: string): Promise<VideoType | null>;
  findByDbId(id: number): Promise<VideoType | null>;
  findPublished(options?: VideoQueryOptions): Promise<VideoType[]>;
  findAll(options?: VideoQueryOptions): Promise<VideoType[]>;
  getCount(options?: VideoQueryOptions): Promise<number>;
  create(data: NewVideoType): Promise<VideoType>;
  update(videoId: string, data: Partial<NewVideoType>): Promise<VideoType | null>;
  delete(videoId: string): Promise<boolean>;
  incrementViews(videoId: string): Promise<void>;
  incrementViewsBy(videoId: string, count: number): Promise<void>;
  incrementLikes(videoId: string): Promise<void>;
  incrementDislikes(videoId: string): Promise<void>;
  incrementComments(videoId: string): Promise<void>;
  decrementComments(videoId: string): Promise<void>;
  updateBandwidth(videoId: string, bandwidth: number): Promise<void>;
  findStreaming(): Promise<VideoType[]>;
  findIndexed(): Promise<VideoType[]>;
  findPendingIndexing(): Promise<VideoType[]>;
  markAllIndexedAsOutdated(): Promise<void>;
  deleteAll(): Promise<number>;
  createMany(data: NewVideoType[]): Promise<VideoType[]>;
}
