/** Canonical operational SQL. Keep this outside generated migration history.
 * Startup installs it transactionally after either historical or freshly generated migrations.
 * Parsing/backfill stays inside the database, without buffering comment histories in JavaScript.
 */
// Match JavaScript trimStart whitespace so indentation cannot change reply semantics by dialect.
const whitespace = [
  9, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
  8232, 8233, 8239, 8287, 12288, 65279,
];
const sqliteTrim = `ltrim(line,char(${whitespace.join(',')}))`;
const postgresTrim = `ltrim(line,U&'${whitespace.map((code) => '\\' + code.toString(16).padStart(4, '0')).join('')}')`;

/** Scan each original line by absolute position, so consuming a pair never loses nesting context. */
function sqliteReferences(source: string): string {
  const start = "pos+instr(substr(text,pos+1),'&gt;&gt;')";
  const after = `substr(text,${start}+8)`;
  return `WITH RECURSIVE lines(video_id,reply_id,rest,line) AS (
 SELECT video_id,reply_id,text||char(10),'' FROM (${source})
 UNION ALL
 SELECT video_id,reply_id,substr(rest,instr(rest,char(10))+1),substr(rest,1,instr(rest,char(10))-1)
 FROM lines WHERE instr(rest,char(10))>0
), refs(video_id,reply_id,text,pos,digits) AS (
 SELECT video_id,reply_id,line,0,'' FROM lines
 WHERE substr(${sqliteTrim},1,4)<>'&gt;' OR ${sqliteTrim} GLOB '&gt;&gt;[0-9]*'
 UNION ALL
 SELECT video_id,reply_id,text,${start}+7,
 substr(${after},1,length(${after})-length(ltrim(${after},'0123456789')))
 FROM refs WHERE instr(substr(text,pos+1),'&gt;&gt;')>0
) SELECT DISTINCT video_id,CAST(digits AS INTEGER),reply_id FROM refs
 WHERE digits<>'' AND CAST(digits AS INTEGER)>0 AND CAST(digits AS INTEGER)<=9007199254740991
 AND (pos<12 OR substr(text,pos-11,4)<>'&gt;')`;
}

function postgresReferences(source: string): string {
  return String.raw`SELECT DISTINCT video_id,(r[1])::numeric::bigint,reply_id
 FROM (${source}) source,
 LATERAL regexp_split_to_table(text,E'\n') lines(line),
 LATERAL regexp_matches(line,'(?<!&gt;)&gt;&gt;([0-9]+)','g') r
 WHERE (left(${postgresTrim},4)<>'&gt;' OR ${postgresTrim} ~ '^&gt;&gt;[0-9]')
 AND length(ltrim(r[1],'0'))<=16 AND (r[1])::numeric BETWEEN 1 AND 9007199254740991`;
}

const newComment =
  'SELECT NEW.video_id AS video_id,NEW.comment_id AS reply_id,NEW.comment_plain_text_sanitized AS text';
const allComments =
  'SELECT video_id,comment_id AS reply_id,comment_plain_text_sanitized AS text FROM comments';

export const sqliteCommentTriggers = String.raw`-- Probe each referenced parent by primary key instead of materializing an entire video history.
DROP TRIGGER IF EXISTS comment_cache_insert;

CREATE TRIGGER comment_cache_insert AFTER INSERT ON comments BEGIN
UPDATE videos SET comments=comments+1 WHERE video_id=NEW.video_id;
INSERT INTO comment_edges(video_id,parent_id,reply_id) ${sqliteReferences(newComment)};
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) SELECT video_id,parent_id FROM comment_edges WHERE video_id=NEW.video_id AND reply_id=NEW.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id);
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) VALUES(NEW.video_id,NEW.comment_id);
END;

DROP TRIGGER IF EXISTS comment_cache_delete;

CREATE TRIGGER comment_cache_delete AFTER DELETE ON comments BEGIN
UPDATE videos SET comments=MAX(0,comments-1) WHERE video_id=OLD.video_id;
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) SELECT video_id,parent_id FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id);
DELETE FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id;
INSERT OR REPLACE INTO comment_changes(video_id,comment_id,deleted) VALUES(OLD.video_id,OLD.comment_id,1);
END;

DROP TRIGGER IF EXISTS comment_cache_update;

CREATE TRIGGER comment_cache_update AFTER UPDATE ON comments BEGIN
UPDATE videos SET comments=MAX(0,comments-1) WHERE video_id=OLD.video_id AND OLD.video_id<>NEW.video_id;
UPDATE videos SET comments=comments+1 WHERE video_id=NEW.video_id AND OLD.video_id<>NEW.video_id;
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) SELECT video_id,parent_id FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id);
DELETE FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id;
INSERT INTO comment_edges(video_id,parent_id,reply_id) ${sqliteReferences(newComment)};
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) SELECT video_id,parent_id FROM comment_edges WHERE video_id=NEW.video_id AND reply_id=NEW.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id);
INSERT OR REPLACE INTO comment_changes(video_id,comment_id) VALUES(NEW.video_id,NEW.comment_id);
END;
`;

export const postgresCommentTriggers = String.raw`-- Probe each referenced parent by primary key instead of materializing an entire video history.
CREATE OR REPLACE FUNCTION update_comment_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Serialize per-video metadata versions until commit; sequence allocation alone is not commit ordering.
 IF TG_OP='UPDATE' AND OLD.video_id IS DISTINCT FROM NEW.video_id THEN
  PERFORM pg_advisory_xact_lock(LEAST(hashtextextended(OLD.video_id,0),hashtextextended(NEW.video_id,0)));
  PERFORM pg_advisory_xact_lock(GREATEST(hashtextextended(OLD.video_id,0),hashtextextended(NEW.video_id,0)));
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(CASE WHEN TG_OP='DELETE' THEN OLD.video_id ELSE NEW.video_id END,0));
 END IF;
 IF TG_OP='INSERT' THEN
  UPDATE videos SET comments=comments+1 WHERE video_id=NEW.video_id;
 ELSIF TG_OP='DELETE' THEN
  UPDATE videos SET comments=GREATEST(0,comments-1) WHERE video_id=OLD.video_id;
 ELSIF OLD.video_id IS DISTINCT FROM NEW.video_id THEN
  UPDATE videos SET comments=GREATEST(0,comments-1) WHERE video_id=OLD.video_id;
  UPDATE videos SET comments=comments+1 WHERE video_id=NEW.video_id;
 END IF;
 IF TG_OP<>'INSERT' THEN
  INSERT INTO comment_changes(video_id,comment_id)
  SELECT video_id,parent_id FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id)
  ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=0;
  DELETE FROM comment_edges WHERE video_id=OLD.video_id AND reply_id=OLD.comment_id;
 END IF;
 IF TG_OP<>'DELETE' THEN
  INSERT INTO comment_edges(video_id,parent_id,reply_id)
  ${postgresReferences(newComment)};
  INSERT INTO comment_changes(video_id,comment_id)
  SELECT video_id,parent_id FROM comment_edges WHERE video_id=NEW.video_id AND reply_id=NEW.comment_id AND EXISTS (SELECT 1 FROM comments target WHERE target.comment_id=comment_edges.parent_id AND target.video_id=comment_edges.video_id)
  ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=0;
  INSERT INTO comment_changes(video_id,comment_id) VALUES(NEW.video_id,NEW.comment_id)
  ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=0;
  RETURN NEW;
 ELSE
  INSERT INTO comment_changes(video_id,comment_id,deleted) VALUES(OLD.video_id,OLD.comment_id,1)
  ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=1;
  RETURN OLD;
 END IF;
END; $$;

DROP TRIGGER IF EXISTS comment_cache_change ON comments;
CREATE TRIGGER comment_cache_change AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION update_comment_cache();`;

export const sqliteCommentBackfill = String.raw`UPDATE videos SET comments=(SELECT count(*) FROM comments c WHERE c.video_id=videos.video_id);
DELETE FROM comment_edges;
INSERT INTO comment_edges(video_id,parent_id,reply_id)
${sqliteReferences(allComments)};


INSERT OR REPLACE INTO comment_changes(video_id,comment_id) SELECT video_id,comment_id FROM comments;
INSERT OR REPLACE INTO comment_changes(video_id,comment_id,deleted)
SELECT c.video_id,c.comment_id,1 FROM comment_changes c WHERE c.deleted=0 AND NOT EXISTS(SELECT 1 FROM comments target WHERE target.video_id=c.video_id AND target.comment_id=c.comment_id);
`;

export const postgresCommentBackfill = String.raw`UPDATE videos SET comments=(SELECT count(*) FROM comments c WHERE c.video_id=videos.video_id);
DELETE FROM comment_edges;
INSERT INTO comment_edges(video_id,parent_id,reply_id)
${postgresReferences(allComments)};

INSERT INTO comment_changes(video_id,comment_id) SELECT video_id,comment_id FROM comments
ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=0;
INSERT INTO comment_changes(video_id,comment_id,deleted)
SELECT c.video_id,c.comment_id,1 FROM comment_changes c WHERE c.deleted=0 AND NOT EXISTS(SELECT 1 FROM comments target WHERE target.video_id=c.video_id AND target.comment_id=c.comment_id)
ON CONFLICT(video_id,comment_id) DO UPDATE SET version=EXCLUDED.version,deleted=1;
`;
