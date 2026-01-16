import type { PaginationOptions } from '@/types/index.js';

export interface IReportsVideosRepository<ReportType, NewReportType> {
  findById(reportId: number): Promise<ReportType | null>;
  findAll(options?: PaginationOptions): Promise<ReportType[]>;
  findByVideoId(videoId: string, options?: PaginationOptions): Promise<ReportType[]>;
  getCount(): Promise<number>;
  create(data: NewReportType): Promise<ReportType>;
  delete(reportId: number): Promise<boolean>;
  deleteByVideoId(videoId: string): Promise<number>;
  countNewerThan(timestamp: number): Promise<number>;
  deleteAll(): Promise<number>;
  createMany(data: NewReportType[]): Promise<ReportType[]>;
}
