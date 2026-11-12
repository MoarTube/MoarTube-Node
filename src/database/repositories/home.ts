import { sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@/database/connection.js';
import type { DatabaseClient as SQLiteClient } from '@/database/sqlite-connection.js';
import type { DatabaseClient as PostgresClient } from '@/database/postgres-connection.js';

export interface HomeQuery {
  searchTerm: string;
  tagTerm: string;
  sortTerm: 'hot' | 'new' | 'recently-discussed' | 'discussed' | 'viewed';
  tagSearch: string;
  commentSearch?: string;
}
export interface HomeVideo {
  videoId: string;
  title: string;
  lengthSeconds: number;
  creationTimestamp: number;
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  isLive: boolean;
  isStreaming: boolean;
}
export interface HomeComment {
  commentId: number;
  videoId: string;
  timestamp: number;
  text: string;
  videoTitle: string;
  videoCommentCount: number;
  lengthSeconds: number;
  isLive: boolean;
  isStreaming: boolean;
}
export class HomeResetError extends Error {}
export class HomeCapacityError extends Error {
  constructor(readonly oversized: boolean) {
    super(
      oversized
        ? 'This search has too many results. Add a search term or choose a tag to narrow it.'
        : 'Search is busy. Please retry in a moment.'
    );
  }
}

/** Admission budgets preserve admitted cursors; pressure never evicts a live snapshot. */
export interface HomeSnapshotLimits {
  lifetimeMs: number;
  rows: number;
  bytes: number;
  totalRows: number;
  totalBytes: number;
  snapshots: number;
}
export const HOME_SNAPSHOT_LIMITS: Readonly<HomeSnapshotLimits> = Object.freeze({
  lifetimeMs: 3_660_000,
  rows: 10_000,
  bytes: 8 * 1024 * 1024,
  totalRows: 250_000,
  totalBytes: 128 * 1024 * 1024,
  snapshots: 4096,
});

/** Public discovery queries only; legacy /videos discovery contracts stay unchanged. */
export class HomeRepository {
  constructor(
    private readonly db: DatabaseClient,
    private readonly dialect: 'sqlite' | 'postgres',
    private readonly snapshotLimits: Readonly<HomeSnapshotLimits> = HOME_SNAPSHOT_LIMITS
  ) {}

  async rows<T extends object>(query: SQL): Promise<T[]> {
    if (this.dialect === 'sqlite') {
      return (this.db as SQLiteClient).all<T>(query);
    }
    return Array.from(await (this.db as PostgresClient).execute(query)) as T[];
  }

  async write(query: SQL): Promise<void> {
    if (this.dialect === 'sqlite') {
      (this.db as SQLiteClient).run(query);
    } else {
      await (this.db as PostgresClient).execute(query);
    }
  }

  private async atomic(queries: SQL[]): Promise<void> {
    if (this.dialect === 'sqlite') {
      (this.db as SQLiteClient).transaction((tx) => {
        for (const query of queries) {
          tx.run(query);
        }
      });
    } else {
      await (this.db as PostgresClient).transaction(async (tx) => {
        for (const query of queries) {
          await tx.execute(query);
        }
      });
    }
  }

  private eligible(alias = 'v'): SQL {
    // Protected records are not public discovery or comment excerpt sources.
    return sql.raw(
      `(${alias}.is_published=true OR ${alias}.is_live=true) AND ${alias}.is_hidden=false AND ${alias}.is_passworded=false`
    );
  }

  private fold(column: string): SQL {
    return sql.raw(`${this.dialect === 'sqlite' ? 'home_fold' : 'lower'}(${column})`);
  }

  private filters(query: HomeQuery, includeTag = true): SQL {
    const conditions = [this.eligible()];
    if (query.searchTerm) {
      // Literal substring search: wildcard metacharacters never acquire SQL semantics.
      const pattern = `%${query.searchTerm.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
      conditions.push(
        sql`(${this.fold('v.title')} LIKE ${pattern} ESCAPE '!' OR ${this.fold('v.description')} LIKE ${pattern} ESCAPE '!' OR ${this.fold('v.tags')} LIKE ${pattern} ESCAPE '!')`
      );
    }
    if (includeTag && query.tagTerm) {
      conditions.push(
        this.dialect === 'sqlite'
          ? sql`EXISTS (SELECT 1 FROM json_each('[' || replace(json_quote(v.tags), ',', '","') || ']') t WHERE trim(t.value)=${query.tagTerm})`
          : sql`EXISTS (SELECT 1 FROM unnest(string_to_array(v.tags, ',')) t(value) WHERE trim(t.value)=${query.tagTerm})`
      );
    }
    return sql.join(conditions, sql` AND `);
  }

  async state() {
    const [state] = await this.rows<{
      epoch: string;
      catalog: number | string;
      stats: number | string;
      comments: number | string;
      safety: number | string;
    }>(sql`SELECT epoch,catalog,stats,comments,safety FROM home_state WHERE id=1`);
    if (!state) {
      throw new Error('Homepage database state is not installed');
    }
    return {
      epoch: state.epoch,
      catalog: Number(state.catalog),
      stats: Number(state.stats),
      comments: Number(state.comments),
      safety: Number(state.safety),
    };
  }

  private json(fields: Record<string, string>): SQL {
    const pairs = Object.entries(fields).flatMap(([key, expression]) => [
      sql`CAST(${key} AS TEXT)`,
      sql.raw(expression),
    ]);
    return sql`${sql.raw(this.dialect === 'sqlite' ? 'json_object' : 'json_build_object')}(${sql.join(pairs, sql`, `)})`;
  }

  private byteLength(value: SQL): SQL {
    return this.dialect === 'sqlite'
      ? sql`length(CAST(${value} AS BLOB))`
      : sql`octet_length(${value})`;
  }

  async ensureSnapshot(
    id: string,
    revision: string,
    kind: 'videos' | 'comments',
    query: HomeQuery,
    now: number,
    safety: number
  ): Promise<void> {
    const existing = await this.rows<{ created: number | string; safety: number | string }>(
      sql`SELECT created,safety FROM home_snapshots WHERE snapshot=${id}`
    );
    if (existing.length) {
      if (Number(existing[0]?.safety) !== safety) {
        throw new HomeResetError('Results changed. Refresh to continue.');
      }
      if (Number(existing[0]?.created) >= now - this.snapshotLimits.lifetimeMs) {
        return;
      }
    }
    // Stop collecting matches before ranking or serializing a catalog of unbounded size.
    // Search matching may still scan the catalog; ranking/body construction is bounded.
    let candidates: SQL;
    let ordered: SQL;
    if (kind === 'videos') {
      const hour = Math.floor(now / 3_600_000);
      const score = sql`COALESCE((SELECT SUM(a.views+3*a.likes) FROM home_activity a WHERE a.video_id=v.video_id AND a.hour>${hour - 24} AND a.hour<=${hour}),0)
        +5*(SELECT COUNT(*) FROM comments c WHERE c.video_id=v.video_id AND c.timestamp>${now - 86_400_000} AND c.timestamp<=${now})`;
      const sort =
        query.sortTerm === 'hot'
          ? score
          : query.sortTerm === 'recently-discussed'
            ? sql`COALESCE((SELECT MAX(c.timestamp) FROM comments c WHERE c.video_id=v.video_id),0)`
            : sql.raw(
                `v.${({ new: 'creation_timestamp', discussed: 'comments', viewed: 'views' } as const)[query.sortTerm]}`
              );
      const body = this.json({
        videoId: 'v.video_id',
        title: 'v.title',
        lengthSeconds: 'v.length_seconds',
        creationTimestamp: 'v.creation_timestamp',
        views: 'v.views',
        likes: 'v.likes',
        dislikes: 'v.dislikes',
        comments: 'v.comments',
        isLive:
          this.dialect === 'sqlite'
            ? "json(CASE WHEN v.is_live THEN 'true' ELSE 'false' END)"
            : 'v.is_live',
        isStreaming:
          this.dialect === 'sqlite'
            ? "json(CASE WHEN v.is_streaming THEN 'true' ELSE 'false' END)"
            : 'v.is_streaming',
      });
      candidates = sql`SELECT v.video_id,v.title,v.length_seconds,v.creation_timestamp,v.views,v.likes,v.dislikes,v.comments,v.is_live,v.is_streaming
        FROM videos v WHERE ${this.filters(query)} LIMIT ${this.snapshotLimits.rows + 1}`;
      ordered = sql`SELECT ${id},ROW_NUMBER() OVER (ORDER BY ${sort} DESC,v.creation_timestamp DESC,v.video_id DESC),v.video_id,CAST(NULL AS BIGINT),CAST(${body} AS TEXT) AS body FROM candidates v`;
    } else {
      const body = this.json({
        commentId: 'c.comment_id',
        videoId: 'c.video_id',
        timestamp: 'c.timestamp',
        text: 'c.comment_plain_text_sanitized',
        videoTitle: 'v.title',
        videoCommentCount: 'v.comments',
        lengthSeconds: 'v.length_seconds',
        isLive:
          this.dialect === 'sqlite'
            ? "json(CASE WHEN v.is_live THEN 'true' ELSE 'false' END)"
            : 'v.is_live',
        isStreaming:
          this.dialect === 'sqlite'
            ? "json(CASE WHEN v.is_streaming THEN 'true' ELSE 'false' END)"
            : 'v.is_streaming',
      });
      const text = (query.commentSearch ?? '')
        .toLowerCase()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const pattern = `%${text.replace(/[!%_]/g, '!$&')}%`;
      const search = text
        ? sql` AND ${this.fold('c.comment_plain_text_sanitized')} LIKE ${pattern} ESCAPE '!'`
        : sql``;
      candidates = sql`SELECT c.comment_id,c.video_id,c.timestamp,c.comment_plain_text_sanitized FROM comments c JOIN videos v ON v.video_id=c.video_id WHERE ${this.filters({ ...query, searchTerm: '' })} AND v.is_comments_enabled=true ${search} LIMIT ${this.snapshotLimits.rows + 1}`;
      ordered = sql`SELECT ${id},ROW_NUMBER() OVER (ORDER BY c.timestamp DESC,c.comment_id DESC),v.video_id,c.comment_id,CAST(${body} AS TEXT) AS body FROM candidates c JOIN videos v ON v.video_id=c.video_id`;
    }
    // Serialize global admission across workers. SQLite's first DELETE takes its
    // write lock; PostgreSQL needs a database-scoped transaction advisory lock.
    const builder = randomUUID();
    const bodyBytes = this.byteLength(sql`body`);
    const stats = sql`WITH candidates AS MATERIALIZED (${candidates}), ranked AS MATERIALIZED (${ordered})
      SELECT COUNT(*) AS rows,CASE WHEN COUNT(*)<=${this.snapshotLimits.rows}
        THEN (SELECT COALESCE(SUM(${bodyBytes}),0) FROM ranked) ELSE 0 END AS bytes FROM candidates`;
    const knownRows = sql`(SELECT COALESCE(SUM(row_count),0) FROM home_snapshots)`;
    const knownBytes = sql`(SELECT COALESCE(SUM(byte_count),0) FROM home_snapshots)`;
    await this.atomic([
      ...(this.dialect === 'postgres' ? [sql`SELECT pg_advisory_xact_lock(618265623)`] : []),
      sql`DELETE FROM home_snapshots WHERE created<${now - this.snapshotLimits.lifetimeMs} OR safety<>(SELECT safety FROM home_state WHERE id=1)`,
      sql`DELETE FROM home_snapshot_rows WHERE snapshot NOT IN (SELECT snapshot FROM home_snapshots)`,
      sql`INSERT INTO home_snapshots(snapshot,kind,revision,created,safety,row_count,byte_count,builder)
        SELECT ${id},${kind},${revision},${now},${safety},budget.rows,budget.bytes,${builder}
        FROM (${stats}) budget
        WHERE budget.rows<=${this.snapshotLimits.rows} AND budget.bytes<=${this.snapshotLimits.bytes}
          AND budget.rows+${knownRows}<=${this.snapshotLimits.totalRows}
          AND budget.bytes+${knownBytes}<=${this.snapshotLimits.totalBytes}
          AND (SELECT COUNT(*) FROM home_snapshots)<${this.snapshotLimits.snapshots}
        ON CONFLICT DO NOTHING`,
      sql`WITH candidates AS MATERIALIZED (${candidates})
        INSERT INTO home_snapshot_rows(snapshot,position,video_id,comment_id,body)
        SELECT * FROM (${ordered}) ranked
        WHERE EXISTS(SELECT 1 FROM home_snapshots WHERE snapshot=${id} AND builder=${builder})
        ON CONFLICT DO NOTHING`,
      // Recheck actual size: PostgreSQL read-committed writers can change counters
      // between admission and publication, even though builders are serialized.
      sql`UPDATE home_snapshots SET
        row_count=(SELECT COUNT(*) FROM home_snapshot_rows WHERE snapshot=${id}),
        byte_count=(SELECT COALESCE(SUM(${bodyBytes}),0) FROM home_snapshot_rows WHERE snapshot=${id})
        WHERE snapshot=${id} AND builder=${builder}`,
      sql`DELETE FROM home_snapshots WHERE snapshot=${id} AND builder=${builder}
        AND (row_count>${this.snapshotLimits.rows} OR byte_count>${this.snapshotLimits.bytes}
          OR ${knownRows}>${this.snapshotLimits.totalRows} OR ${knownBytes}>${this.snapshotLimits.totalBytes})`,
      sql`DELETE FROM home_snapshot_rows WHERE snapshot NOT IN (SELECT snapshot FROM home_snapshots)`,
      sql`DELETE FROM home_activity WHERE hour<${Math.floor(now / 3_600_000) - 48}`,
    ]);
    if (!(await this.rows(sql`SELECT snapshot FROM home_snapshots WHERE snapshot=${id}`)).length) {
      const [budget] = await this.rows<{ rows: number | string; bytes: number | string }>(stats);
      throw new HomeCapacityError(
        Number(budget?.rows) > this.snapshotLimits.rows ||
          Number(budget?.bytes) > this.snapshotLimits.bytes
      );
    }
  }

  async page(id: string, position: number, limit: number, kind: 'videos' | 'comments') {
    const valid = sql`SELECT s.snapshot FROM home_snapshots s JOIN home_state h ON h.id=1 AND h.safety=s.safety WHERE s.snapshot=${id} AND s.created>=${Date.now() - this.snapshotLimits.lifetimeMs}`;
    const exists = await this.rows(valid);
    if (!exists.length) {
      throw new HomeResetError('This page expired. Refresh to load current results.');
    }
    const commentGuard =
      kind === 'comments'
        ? sql`AND EXISTS(SELECT 1 FROM comments c WHERE c.comment_id=r.comment_id AND c.video_id=r.video_id) AND v.is_comments_enabled=true`
        : sql``;
    const from = sql`FROM home_snapshot_rows r JOIN videos v ON v.video_id=r.video_id WHERE r.snapshot=${id} AND ${this.eligible()} ${commentGuard}`;
    const rows = await this.rows<{ position: number; body: string }>(
      sql`SELECT r.position,r.body ${from} AND r.position>${position} ORDER BY r.position LIMIT ${limit + 1}`
    );
    const [count] = await this.rows<{ count: number | string }>(
      sql`SELECT COUNT(*) AS count ${from}`
    );
    if (!(await this.rows(valid)).length) {
      throw new HomeResetError('Results changed while loading. Refresh to continue.');
    }
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => JSON.parse(row.body) as HomeVideo | HomeComment),
      totalCount: Number(count?.count ?? 0),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? Number(page.at(-1)?.position) : null,
    };
  }

  async tags(query: HomeQuery, offset: number) {
    const split =
      this.dialect === 'sqlite'
        ? sql.raw(`json_each('[' || replace(json_quote(v.tags), ',', '","') || ']') t`)
        : sql.raw(`LATERAL unnest(string_to_array(v.tags, ',')) t(value)`);
    const pattern = `%${query.tagSearch.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    const tags = await this.rows<{ label: string; count: number | string }>(
      sql`SELECT trim(t.value) AS label,COUNT(DISTINCT v.video_id) AS count FROM videos v,${split} WHERE ${this.filters(query, false)} AND trim(t.value)<>'' AND ${this.fold('trim(t.value)')} LIKE ${pattern} ESCAPE '!' GROUP BY trim(t.value) ORDER BY trim(t.value) LIMIT 51 OFFSET ${offset}`
    );
    const [all] = await this.rows<{ count: number | string }>(
      sql`SELECT COUNT(*) AS count FROM videos v WHERE ${this.filters(query, false)}`
    );
    return {
      tags: tags.slice(0, 50).map((tag) => ({ label: tag.label, count: Number(tag.count) })),
      allCount: Number(all?.count ?? 0),
      hasMore: tags.length > 50,
      nextCursor: tags.length > 50 ? offset + 50 : null,
    };
  }
}
