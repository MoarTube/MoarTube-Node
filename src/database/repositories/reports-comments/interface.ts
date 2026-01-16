import type { PaginationOptions } from '@/types/index.js';

export interface IReportsCommentsRepository<CommentReportType, NewCommentReportType> {
  findById(reportId: number): Promise<CommentReportType | null>;
  findAll(options?: PaginationOptions): Promise<CommentReportType[]>;
  findByVideoId(videoId: string, options?: PaginationOptions): Promise<CommentReportType[]>;
  findByCommentId(commentId: number, options?: PaginationOptions): Promise<CommentReportType[]>;
  getCount(): Promise<number>;
  create(data: NewCommentReportType): Promise<CommentReportType>;
  delete(reportId: number): Promise<boolean>;
  deleteByCommentId(commentId: number): Promise<number>;
  deleteByVideoId(videoId: string): Promise<number>;
  countNewerThan(timestamp: number): Promise<number>;
  deleteAll(): Promise<number>;
  createMany(data: NewCommentReportType[]): Promise<CommentReportType[]>;
}