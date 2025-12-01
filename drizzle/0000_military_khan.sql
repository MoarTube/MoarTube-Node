CREATE TABLE `commentreports` (
	`report_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`comment_timestamp` integer NOT NULL,
	`video_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`email` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commentreportsarchives` (
	`archive_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`comment_timestamp` integer NOT NULL,
	`video_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`email` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`comment_plain_text_sanitized` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cryptowalletaddresses` (
	`wallet_address_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`chain` text NOT NULL,
	`chain_id` text NOT NULL,
	`currency` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `links` (
	`link_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`svg_graphic` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `livechatmessages` (
	`chat_message_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`username` text NOT NULL,
	`username_color_hex_code` text NOT NULL,
	`chat_message` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videoreports` (
	`report_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`video_timestamp` integer NOT NULL,
	`video_id` text NOT NULL,
	`email` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videoreportsarchives` (
	`archive_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`video_timestamp` integer NOT NULL,
	`video_id` text NOT NULL,
	`email` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`source_file_extension` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tags` text NOT NULL,
	`length_seconds` integer NOT NULL,
	`length_timestamp` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`dislikes` integer DEFAULT 0 NOT NULL,
	`bandwidth` integer DEFAULT 0 NOT NULL,
	`is_importing` integer DEFAULT false NOT NULL,
	`is_imported` integer DEFAULT false NOT NULL,
	`is_publishing` integer DEFAULT false NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`is_streaming` integer DEFAULT false NOT NULL,
	`is_streamed` integer DEFAULT false NOT NULL,
	`is_stream_recorded_remotely` integer DEFAULT false NOT NULL,
	`is_stream_recorded_locally` integer DEFAULT false NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`is_indexing` integer DEFAULT false NOT NULL,
	`is_indexed` integer DEFAULT false NOT NULL,
	`is_index_outdated` integer DEFAULT false NOT NULL,
	`is_error` integer DEFAULT false NOT NULL,
	`is_finalized` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_passworded` integer DEFAULT false NOT NULL,
	`password` text DEFAULT '' NOT NULL,
	`is_comments_enabled` integer DEFAULT true NOT NULL,
	`is_likes_enabled` integer DEFAULT true NOT NULL,
	`is_dislikes_enabled` integer DEFAULT true NOT NULL,
	`is_reports_enabled` integer DEFAULT true NOT NULL,
	`is_live_chat_enabled` integer DEFAULT true NOT NULL,
	`outputs` text DEFAULT '{}' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`creation_timestamp` integer NOT NULL
);
