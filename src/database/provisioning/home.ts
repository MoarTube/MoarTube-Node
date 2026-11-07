import { randomUUID } from 'node:crypto';
import type SQLite from 'better-sqlite3';
import type postgres from 'postgres';

// Operational tables, like the comment cache, are installed after historical migrations.
const tables = `
CREATE TABLE IF NOT EXISTS home_state (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL, catalog BIGINT NOT NULL DEFAULT 0, stats BIGINT NOT NULL DEFAULT 0, comments BIGINT NOT NULL DEFAULT 0, safety BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS home_activity (video_id TEXT NOT NULL, hour BIGINT NOT NULL, views BIGINT NOT NULL DEFAULT 0, likes BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(video_id,hour));
CREATE TABLE IF NOT EXISTS home_snapshots (snapshot TEXT PRIMARY KEY, kind TEXT NOT NULL, revision TEXT NOT NULL, created BIGINT NOT NULL, safety BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS home_snapshot_rows (snapshot TEXT NOT NULL, position BIGINT NOT NULL, video_id TEXT NOT NULL, comment_id BIGINT, body TEXT NOT NULL, PRIMARY KEY(snapshot,position));
CREATE INDEX IF NOT EXISTS home_snapshot_video ON home_snapshot_rows(video_id);
CREATE INDEX IF NOT EXISTS home_video_identity ON videos(video_id);
CREATE INDEX IF NOT EXISTS home_video_created ON videos(creation_timestamp,video_id);
CREATE INDEX IF NOT EXISTS comments_global_history ON comments(timestamp,comment_id);
`;
const catalogFields = [
  'video_id',
  'title',
  'description',
  'tags',
  'length_seconds',
  'creation_timestamp',
  'is_published',
  'is_live',
  'is_streaming',
  'is_hidden',
  'is_passworded',
  'is_comments_enabled',
];

export function provisionSQLiteHome(client: SQLite.Database): void {
  client
    .transaction(() => {
      client.exec(tables);
      const columns = client.pragma('table_info(home_state)') as { name: string }[];
      if (!columns.some((column) => column.name === 'safety')) {
        client.exec('ALTER TABLE home_state ADD COLUMN safety BIGINT NOT NULL DEFAULT 0');
      }
      const snapshotColumns = client.pragma('table_info(home_snapshots)') as { name: string }[];
      if (!snapshotColumns.some((column) => column.name === 'safety')) {
        client.exec('ALTER TABLE home_snapshots ADD COLUMN safety BIGINT NOT NULL DEFAULT 0');
      }
      client.prepare('INSERT OR IGNORE INTO home_state(id,epoch) VALUES(1,?)').run(randomUUID());
      const changed = catalogFields.map((field) => `NEW.${field} IS NOT OLD.${field}`).join(' OR ');
      client.exec(`
CREATE TRIGGER IF NOT EXISTS home_video_insert AFTER INSERT ON videos BEGIN UPDATE home_state SET catalog=catalog+1 WHERE id=1; END;
DROP TRIGGER IF EXISTS home_video_delete;
CREATE TRIGGER home_video_delete AFTER DELETE ON videos BEGIN
 UPDATE home_state SET catalog=catalog+1,comments=comments+1,safety=safety+1 WHERE id=1;
 DELETE FROM home_activity WHERE video_id=OLD.video_id;
END;
DROP TRIGGER IF EXISTS home_video_update;
CREATE TRIGGER home_video_update AFTER UPDATE ON videos WHEN (${changed}) OR NEW.views<>OLD.views OR NEW.likes<>OLD.likes OR NEW.dislikes<>OLD.dislikes OR NEW.comments<>OLD.comments BEGIN
 UPDATE home_state SET catalog=catalog+CASE WHEN ${changed} THEN 1 ELSE 0 END,
 safety=safety+CASE WHEN ${changed} THEN 1 ELSE 0 END,
 stats=stats+CASE WHEN NEW.views<>OLD.views OR NEW.likes<>OLD.likes OR NEW.dislikes<>OLD.dislikes OR NEW.comments<>OLD.comments THEN 1 ELSE 0 END WHERE id=1;
 INSERT INTO home_activity(video_id,hour,views,likes)
 SELECT NEW.video_id,CAST(strftime('%s','now') AS INTEGER)/3600,MAX(0,NEW.views-OLD.views),MAX(0,NEW.likes-OLD.likes)
 WHERE NEW.views>OLD.views OR NEW.likes>OLD.likes
 ON CONFLICT(video_id,hour) DO UPDATE SET views=views+excluded.views,likes=likes+excluded.likes;
END;
CREATE TRIGGER IF NOT EXISTS home_comment_insert AFTER INSERT ON comments BEGIN UPDATE home_state SET comments=comments+1 WHERE id=1; END;
DROP TRIGGER IF EXISTS home_comment_update;
CREATE TRIGGER home_comment_update AFTER UPDATE ON comments BEGIN UPDATE home_state SET comments=comments+1,safety=safety+1 WHERE id=1; END;
DROP TRIGGER IF EXISTS home_comment_delete;
CREATE TRIGGER home_comment_delete AFTER DELETE ON comments BEGIN UPDATE home_state SET comments=comments+1,safety=safety+1 WHERE id=1; END;
`);
    })
    .immediate();
}

export async function provisionPostgresHome(client: postgres.Sql): Promise<void> {
  await client.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(618265622)');
    await tx.unsafe(tables).simple();
    await tx.unsafe(
      'ALTER TABLE home_state ADD COLUMN IF NOT EXISTS safety BIGINT NOT NULL DEFAULT 0'
    );
    await tx.unsafe(
      'ALTER TABLE home_snapshots ADD COLUMN IF NOT EXISTS safety BIGINT NOT NULL DEFAULT 0'
    );
    await tx.unsafe('INSERT INTO home_state(id,epoch) VALUES(1,$1) ON CONFLICT DO NOTHING', [
      randomUUID(),
    ]);
    const changed = catalogFields
      .map((field) => `NEW.${field} IS DISTINCT FROM OLD.${field}`)
      .join(' OR ');
    await tx
      .unsafe(
        `
CREATE OR REPLACE FUNCTION home_video_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN UPDATE home_state SET catalog=catalog+1 WHERE id=1; RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN
  UPDATE home_state SET catalog=catalog+1,comments=comments+1,safety=safety+1 WHERE id=1;
  DELETE FROM home_activity WHERE video_id=OLD.video_id; RETURN OLD;
 END IF;
 IF NOT (${changed}) AND NEW.views=OLD.views AND NEW.likes=OLD.likes AND NEW.dislikes=OLD.dislikes AND NEW.comments=OLD.comments THEN RETURN NEW; END IF;
 UPDATE home_state SET catalog=catalog+CASE WHEN ${changed} THEN 1 ELSE 0 END,
 safety=safety+CASE WHEN ${changed} THEN 1 ELSE 0 END,
 stats=stats+CASE WHEN NEW.views<>OLD.views OR NEW.likes<>OLD.likes OR NEW.dislikes<>OLD.dislikes OR NEW.comments<>OLD.comments THEN 1 ELSE 0 END WHERE id=1;
 IF NEW.views>OLD.views OR NEW.likes>OLD.likes THEN
  INSERT INTO home_activity(video_id,hour,views,likes) VALUES(NEW.video_id,FLOOR(EXTRACT(EPOCH FROM clock_timestamp())/3600),GREATEST(0,NEW.views-OLD.views),GREATEST(0,NEW.likes-OLD.likes))
  ON CONFLICT(video_id,hour) DO UPDATE SET views=home_activity.views+excluded.views,likes=home_activity.likes+excluded.likes;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS home_video_change ON videos;
CREATE TRIGGER home_video_change AFTER INSERT OR UPDATE OR DELETE ON videos FOR EACH ROW EXECUTE FUNCTION home_video_change();
CREATE OR REPLACE FUNCTION home_comment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE home_state SET comments=comments+1,safety=safety+CASE WHEN TG_OP='INSERT' THEN 0 ELSE 1 END WHERE id=1; RETURN NULL; END $$;
DROP TRIGGER IF EXISTS home_comment_change ON comments;
CREATE TRIGGER home_comment_change AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION home_comment_change();
`
      )
      .simple();
  });
}
