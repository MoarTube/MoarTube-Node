CREATE TABLE "commentreports" (
	"report_id" serial PRIMARY KEY NOT NULL,
	"timestamp" bigint NOT NULL,
	"comment_timestamp" bigint NOT NULL,
	"video_id" text NOT NULL,
	"comment_id" integer NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commentreportsarchives" (
	"archive_id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"timestamp" bigint NOT NULL,
	"comment_timestamp" bigint NOT NULL,
	"video_id" text NOT NULL,
	"comment_id" integer NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"comment_id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"comment_plain_text_sanitized" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cryptowalletaddresses" (
	"wallet_address_id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"chain" text NOT NULL,
	"chain_id" text NOT NULL,
	"currency" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"link_id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"svg_graphic" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livechatmessages" (
	"chat_message_id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"username" text NOT NULL,
	"username_color_hex_code" text NOT NULL,
	"chat_message" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videoreports" (
	"report_id" serial PRIMARY KEY NOT NULL,
	"timestamp" bigint NOT NULL,
	"video_timestamp" bigint NOT NULL,
	"video_id" text NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videoreportsarchives" (
	"archive_id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"timestamp" bigint NOT NULL,
	"video_timestamp" bigint NOT NULL,
	"video_id" text NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"source_file_extension" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tags" text NOT NULL,
	"length_seconds" integer NOT NULL,
	"length_timestamp" text,
	"views" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"dislikes" integer DEFAULT 0 NOT NULL,
	"bandwidth" integer DEFAULT 0 NOT NULL,
	"is_importing" boolean DEFAULT false NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"is_publishing" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_streaming" boolean DEFAULT false NOT NULL,
	"is_streamed" boolean DEFAULT false NOT NULL,
	"is_stream_recorded_remotely" boolean DEFAULT false NOT NULL,
	"is_stream_recorded_locally" boolean DEFAULT false NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"is_indexing" boolean DEFAULT false NOT NULL,
	"is_indexed" boolean DEFAULT false NOT NULL,
	"is_index_outdated" boolean DEFAULT false NOT NULL,
	"is_error" boolean DEFAULT false NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_passworded" boolean DEFAULT false NOT NULL,
	"password" text DEFAULT '' NOT NULL,
	"is_comments_enabled" boolean DEFAULT true NOT NULL,
	"is_likes_enabled" boolean DEFAULT true NOT NULL,
	"is_dislikes_enabled" boolean DEFAULT true NOT NULL,
	"is_reports_enabled" boolean DEFAULT true NOT NULL,
	"is_live_chat_enabled" boolean DEFAULT true NOT NULL,
	"outputs" text DEFAULT '{}' NOT NULL,
	"meta" text DEFAULT '{}' NOT NULL,
	"creation_timestamp" bigint NOT NULL
);
