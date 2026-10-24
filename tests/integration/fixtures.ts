export const video = (video_id: string, creation_timestamp = 100) => ({
  video_id,
  title: `Video ${video_id}`,
  description: 'Description',
  tags: 'music,live',
  length_seconds: 60,
  creation_timestamp,
});

export const comment = (video_id = 'a', timestamp = 100) => ({
  video_id,
  timestamp,
  comment_plain_text_sanitized: `Comment ${timestamp} — 你好 ' quoted`,
});

export const message = (video_id = 'a', timestamp = 100) => ({
  video_id,
  timestamp,
  username: 'Viewer',
  username_color_hex_code: '#123456',
  chat_message: `Message ${timestamp}`,
});

export const report = (video_id = 'a', timestamp = 100) => ({
  video_id,
  timestamp,
  video_timestamp: 50,
  comment_timestamp: 50,
  comment_id: 1,
  report_id: timestamp,
  email: 'viewer@example.test',
  type: 'spam',
  message: `Report ${timestamp}`,
});
