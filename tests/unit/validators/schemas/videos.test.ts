import { describe, it, expect } from 'vitest';
import {
  videoIdParamsSchema,
  videoCommentIdParamsSchema,
  videoAdaptiveManifestParamsSchema,
  videoSearchQuerySchema,
  videoCommentsQuerySchema,
  videoCommentDeleteQuerySchema,
  videoCommentGetQuerySchema,
} from '@/validators/schemas/videos.js';

describe('validators/schemas/videos.ts', () => {
  describe('videoIdParamsSchema', () => {
    it('should validate valid video ID parameters', () => {
      const params = { videoId: 'dQw4w9WgXcQ' };
      expect(() => videoIdParamsSchema.parse(params)).not.toThrow();
      expect(videoIdParamsSchema.parse(params)).toEqual(params);
    });

    it('should reject invalid video ID parameters', () => {
      const params = { videoId: 'invalid' };
      expect(() => videoIdParamsSchema.parse(params)).toThrow('Invalid video ID format');
    });
  });

  describe('videoCommentIdParamsSchema', () => {
    it('should validate valid video and comment ID parameters', () => {
      const params = {
        videoId: 'dQw4w9WgXcQ',
        commentId: 123,
      };
      expect(() => videoCommentIdParamsSchema.parse(params)).not.toThrow();
      expect(videoCommentIdParamsSchema.parse(params)).toEqual(params);
    });

    it('should reject invalid video ID', () => {
      const params = {
        videoId: 'invalid',
        commentId: 123,
      };
      expect(() => videoCommentIdParamsSchema.parse(params)).toThrow('Invalid video ID format');
    });

    it('should reject invalid comment ID', () => {
      const params = {
        videoId: 'dQw4w9WgXcQ',
        commentId: 0,
      };
      expect(() => videoCommentIdParamsSchema.parse(params)).toThrow();
    });
  });

  describe('videoAdaptiveManifestParamsSchema', () => {
    it('should validate valid adaptive manifest parameters', () => {
      const params = {
        videoId: 'dQw4w9WgXcQ',
        manifestType: 'static',
      };
      expect(() => videoAdaptiveManifestParamsSchema.parse(params)).not.toThrow();
      expect(videoAdaptiveManifestParamsSchema.parse(params)).toEqual(params);
    });

    it('should validate dynamic manifest type', () => {
      const params = {
        videoId: 'dQw4w9WgXcQ',
        manifestType: 'dynamic',
      };
      expect(videoAdaptiveManifestParamsSchema.parse(params)).toEqual(params);
    });

    it('should reject invalid manifest type', () => {
      const params = {
        videoId: 'dQw4w9WgXcQ',
        manifestType: 'live',
      };
      expect(() => videoAdaptiveManifestParamsSchema.parse(params)).toThrow();
    });
  });

  describe('videoSearchQuerySchema', () => {
    it('should validate complete search query parameters', () => {
      const query = {
        searchTerm: 'test search',
        sortTerm: 'popular',
        tagTerm: 'gaming',
        tagLimit: 10,
        timestamp: 1640995200000,
      };
      expect(() => videoSearchQuerySchema.parse(query)).not.toThrow();
      expect(videoSearchQuerySchema.parse(query)).toEqual(query);
    });

    it('should validate minimal search query parameters', () => {
      const query = {
        searchTerm: undefined,
        sortTerm: 'latest' as const,
        tagTerm: undefined,
        tagLimit: 0,
        timestamp: 1640995200000,
      };
      const result = videoSearchQuerySchema.parse(query);
      expect(result.searchTerm).toBeUndefined();
      expect(result.sortTerm).toBe('latest');
      expect(result.tagTerm).toBeUndefined();
      expect(result.tagLimit).toBe(0);
      expect(result.timestamp).toBe(1640995200000);
    });

    it('should reject invalid sort term', () => {
      const query = {
        searchTerm: 'test',
        sortTerm: 'alphabetical',
        timestamp: 1640995200000,
      };
      expect(() => videoSearchQuerySchema.parse(query)).toThrow();
    });
  });

  describe('videoCommentsQuerySchema', () => {
    it('should validate valid comments query parameters', () => {
      const query = {
        type: 'before',
        sort: 'ascending',
        timestamp: 1640995200000,
      };
      expect(() => videoCommentsQuerySchema.parse(query)).not.toThrow();
      expect(videoCommentsQuerySchema.parse(query)).toEqual(query);
    });

    it('should validate after type', () => {
      const query = {
        type: 'after',
        sort: 'descending',
        timestamp: 1640995200000,
      };
      expect(videoCommentsQuerySchema.parse(query)).toEqual(query);
    });

    it('should reject invalid type', () => {
      const query = {
        type: 'around',
        sort: 'ascending',
        timestamp: 1640995200000,
      };
      expect(() => videoCommentsQuerySchema.parse(query)).toThrow();
    });
  });

  describe('videoCommentDeleteQuerySchema', () => {
    it('should validate comment delete query parameters', () => {
      const query = { timestamp: 1640995200000 };
      expect(() => videoCommentDeleteQuerySchema.parse(query)).not.toThrow();
      expect(videoCommentDeleteQuerySchema.parse(query)).toEqual(query);
    });

    it('should coerce string timestamp', () => {
      const query = { timestamp: '1640995200000' };
      expect(videoCommentDeleteQuerySchema.parse(query)).toEqual({ timestamp: 1640995200000 });
    });
  });

  describe('videoCommentGetQuerySchema', () => {
    it('should validate comment get query parameters', () => {
      const query = { timestamp: 1640995200000 };
      expect(() => videoCommentGetQuerySchema.parse(query)).not.toThrow();
      expect(videoCommentGetQuerySchema.parse(query)).toEqual(query);
    });
  });
});