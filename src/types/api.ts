/**
 * API type definitions
 * Only the types that are actually used in the codebase
 */

/**
 * Video data response (for WebSocket broadcasts)
 */
export interface VideoDataPayload {
  videoId: string;
  thumbnail: string;
  title: string;
  description: string;
  tags: string;
  lengthSeconds: number;
  lengthTimestamp: string;
  views: number;
  comments: number;
  likes: number;
  dislikes: number;
  bandwidth: number;
  isImporting: number;
  isImported: number;
  isPublishing: number;
  isPublished: number;
  isLive: number;
  isStreaming: number;
  isStreamed: number;
  isStreamRecordedRemotely: number;
  isStreamRecordedLocally: number;
  isIndexed: number;
  isIndexing: number;
  isIndexOutdated: number;
  isError: number;
  isFinalized: number;
  meta: string;
  creationTimestamp: number;
}
