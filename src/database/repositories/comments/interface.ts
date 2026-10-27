export interface ICommentsRepository<CommentType, NewCommentType> {
  findByIds(videoId: string, ids: number[]): Promise<CommentType[]>;
  findById(videoId: string, commentId: number, timestamp?: number): Promise<CommentType | null>;
  findByVideoId(videoId: string, page?: { limit: number; offset: number }): Promise<CommentType[]>;
  findByVideoIdWithTimestampFilter(
    videoId: string,
    type: 'before' | 'after',
    sort: 'ascending' | 'descending',
    timestamp: number,
    cursorId?: number
  ): Promise<CommentType[]>;
  getBacklinksForComments(
    videoId: string,
    ids: number[],
    beforeReplyId?: number
  ): Promise<{ parent_id: number; reply_id: number }[]>;
  getCacheEpoch(): Promise<string>;
  getCacheVersion(videoId: string): Promise<number>;
  getCacheChanges(
    videoId: string,
    since: number
  ): Promise<{ version: number; comment_id: number; deleted: number }[]>;
  countByVideoId(videoId: string): Promise<number>;
  findAll(): Promise<CommentType[]>;
  create(data: NewCommentType): Promise<CommentType>;
  update(id: number, data: Partial<NewCommentType>): Promise<CommentType | null>;
  delete(videoId: string, commentId: number, timestamp: number): Promise<boolean>;
  deleteByVideoId(videoId: string): Promise<number>;
  findByVideoIdAndTimestamp(videoId: string, timestamp: number): Promise<CommentType | null>;
  countAll(): Promise<number>;
  countNewerThan(timestamp: number): Promise<number>;
  search(
    limit: number,
    sortDirection: string,
    timestamp: number,
    videoId?: string,
    searchTerm?: string
  ): Promise<CommentType[]>;
  deleteAll(): Promise<number>;
  createMany(data: NewCommentType[]): Promise<CommentType[]>;
}
