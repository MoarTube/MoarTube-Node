/**
 * Database model type definitions
 * These types will be fully implemented in Phase 1
 */

export interface Video {
  video_id: string;
  title: string;
  description: string;
  tags: string;
  views: number;
  likes: number;
  dislikes: number;
}

export interface Comment {
  id: number;
  video_id: string;
  comment_plain_text_sanitized: string;
  timestamp: number;
}
