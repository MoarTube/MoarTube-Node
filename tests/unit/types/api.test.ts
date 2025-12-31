import { describe, it, expect } from 'vitest';
import type { VideoDataPayload } from '@/types/api.js';

describe('types/api.ts', () => {
  describe('VideoDataPayload interface', () => {
    it('should create a valid VideoDataPayload object', () => {
      const payload: VideoDataPayload = {
        videoId: 'test-video-id',
        thumbnail: 'thumbnail.jpg',
        title: 'Test Video',
        description: 'Test video description',
        tags: 'test,video',
        lengthSeconds: 300,
        lengthTimestamp: '00:05:00',
        views: 100,
        comments: 10,
        likes: 20,
        dislikes: 2,
        bandwidth: 5000000,
        isImporting: 0,
        isImported: 1,
        isPublishing: 0,
        isPublished: 1,
        isLive: 0,
        isStreaming: 0,
        isStreamed: 0,
        isStreamRecordedRemotely: 0,
        isStreamRecordedLocally: 0,
        isIndexed: 1,
        isIndexing: 0,
        isIndexOutdated: 0,
        isError: 0,
        isFinalized: 1,
        meta: '{"format":"mp4","resolution":"1080p"}',
        creationTimestamp: 1640995200000,
      };

      expect(payload.videoId).toBe('test-video-id');
      expect(payload.title).toBe('Test Video');
      expect(payload.views).toBe(100);
      expect(payload.isPublished).toBe(1);
      expect(payload.isFinalized).toBe(1);
    });

    it('should handle live streaming state flags', () => {
      const livePayload: VideoDataPayload = {
        videoId: 'live-video-id',
        thumbnail: 'live.jpg',
        title: 'Live Stream',
        description: 'Live streaming test',
        tags: 'live,stream',
        lengthSeconds: 0,
        lengthTimestamp: '00:00:00',
        views: 50,
        comments: 5,
        likes: 10,
        dislikes: 0,
        bandwidth: 2000000,
        isImporting: 0,
        isImported: 0,
        isPublishing: 0,
        isPublished: 0,
        isLive: 1,
        isStreaming: 1,
        isStreamed: 0,
        isStreamRecordedRemotely: 0,
        isStreamRecordedLocally: 1,
        isIndexed: 0,
        isIndexing: 0,
        isIndexOutdated: 0,
        isError: 0,
        isFinalized: 0,
        meta: '{"isLive":true}',
        creationTimestamp: Date.now(),
      };

      expect(livePayload.isLive).toBe(1);
      expect(livePayload.isStreaming).toBe(1);
      expect(livePayload.isStreamRecordedLocally).toBe(1);
    });

    it('should handle error state', () => {
      const errorPayload: VideoDataPayload = {
        videoId: 'error-video-id',
        thumbnail: 'error.jpg',
        title: 'Error Video',
        description: 'Video with error',
        tags: 'error',
        lengthSeconds: 0,
        lengthTimestamp: '00:00:00',
        views: 0,
        comments: 0,
        likes: 0,
        dislikes: 0,
        bandwidth: 0,
        isImporting: 0,
        isImported: 0,
        isPublishing: 0,
        isPublished: 0,
        isLive: 0,
        isStreaming: 0,
        isStreamed: 0,
        isStreamRecordedRemotely: 0,
        isStreamRecordedLocally: 0,
        isIndexed: 0,
        isIndexing: 0,
        isIndexOutdated: 0,
        isError: 1,
        isFinalized: 0,
        meta: '{"error":"Processing failed"}',
        creationTimestamp: Date.now(),
      };

      expect(errorPayload.isError).toBe(1);
      expect(errorPayload.isFinalized).toBe(0);
    });
  });
});