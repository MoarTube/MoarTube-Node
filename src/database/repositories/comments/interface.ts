export interface ICommentsRepository<CommentType, NewCommentType> {
  findById(videoId: string, commentId: number, timestamp: number): Promise<CommentType | null>;
  findByVideoId(videoId: string): Promise<CommentType[]>;
  findByVideoIdWithTimestampFilter(
    videoId: string,
    type: 'before' | 'after',
    sort: 'ascending' | 'descending',
    timestamp: number
  ): Promise<CommentType[]>;
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
