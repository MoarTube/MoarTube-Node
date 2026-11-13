import { provisionSQLiteHome } from '@/database/provisioning/home.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import view from '@fastify/view';
import ejs from 'ejs';
import { resolve } from 'node:path';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import {
  HomeRepository,
  HomeResetError,
  type HomeQuery,
  type HomeVideo,
  type HomeComment,
} from '@/database/repositories/home.js';
import { HomeService } from '@/services/home.js';
import { homeRoutes } from '@/routes/home.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import { openTestDatabase, video, comment } from './helpers.js';
import { createDatabase as openWorkerConnection } from '@/database/sqlite-connection.js';
import type SQLite from 'better-sqlite3';

const config = vi.hoisted(() => ({
  nodeSettings: {
    nodeName: 'backyard.tube',
    nodeHeadline: 'Your node. Your people. Your rabbit hole.',
    nodeAbout: 'Watch, like, and comment. No account needed.',
    nodeBulletin: ['Welcome'],
    nodeLinks: [{ url: 'https://rivet.tube', description: 'Film & art' }],
    storageConfig: { storageMode: 'filesystem' },
    isCloudflareTunnelEnabled: false,
    publicNodeProtocol: 'https',
    publicNodeAddress: 'node.example.test',
    publicNodePort: '',
    isCloudflareCdnEnabled: true,
  },
}));
vi.mock('@/config/index.js', () => ({ getConfig: () => config }));
const empty: HomeQuery = { searchTerm: '', tagTerm: '', sortTerm: 'new', tagSearch: '' };

describe('Homepage real database and public routes', () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>>;
  let repository: HomeRepository;
  let service: HomeService;
  let videos: ReturnType<typeof createVideosRepository>;
  let comments: ReturnType<typeof createCommentsRepository>;
  beforeEach(async () => {
    database = await openTestDatabase();
    repository = new HomeRepository(database.db, 'sqlite');
    service = new HomeService(repository);
    videos = createVideosRepository('sqlite', database.db);
    comments = createCommentsRepository('sqlite', database.db);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await database?.close();
  });
  const input = () => ({ cursor: 0 });

  it('loads tags and Unicode video search on a worker connection without running schema initialization', async () => {
    await videos.create({
      ...video('worker'),
      title: 'Worker Caf\u00e9',
      tags: 'music,diy',
      is_published: true,
    });
    const worker = openWorkerConnection({ filepath: database.client.name });
    try {
      const workerService = new HomeService(new HomeRepository(worker, 'sqlite'));
      const tags = await workerService.tags(empty, { cursor: 0 });
      expect(tags.tags).toContainEqual({ label: 'music', count: 1 });
      const filtered = await workerService.page(
        'videos',
        { ...empty, searchTerm: 'CAF\u00c9' },
        { cursor: 0 }
      );
      expect(filtered.totalCount).toBe(1);
      const app = Fastify();
      app.setValidatorCompiler(validatorCompiler);
      app.decorate('optionalAuthenticate', async () => {});
      homeRoutes(app, { resolve: () => workerService } as never);
      try {
        const state = await workerService.state();
        const response = await app.inject(
          '/home/tags?' + new URLSearchParams({ epoch: state.epoch, revision: state.revision })
        );
        expect(response.statusCode).toBe(200);
        expect(response.json().tags).toContainEqual({ label: 'diy', count: 1 });
      } finally {
        await app.close();
      }
    } finally {
      (worker as typeof worker & { $client: SQLite.Database }).$client.close();
    }
  });

  it('filters public videos, literal search and exact tag membership with distinct facets and untagged All', async () => {
    await videos.createMany([
      {
        ...video('one'),
        title: '100% DIY_test Caf\u00e9',
        tags: 'diy,diy,music',
        is_published: true,
      },
      { ...video('two'), tags: 'diy-extra', is_published: true },
      { ...video('untagged'), tags: '', is_published: true },
      { ...video('hidden'), is_published: true, is_hidden: true },
      { ...video('protected'), is_published: true, is_passworded: true, password: 'secret' },
      { ...video('unpublished') },
    ]);
    expect((await service.page('videos', empty, input())).totalCount).toBe(3);
    expect(
      (await service.page('videos', { ...empty, searchTerm: 'CAF\u00c9' }, input())).totalCount
    ).toBe(1);
    const filtered = await service.page(
      'videos',
      { ...empty, tagTerm: 'diy', searchTerm: 'DIY_' },
      input()
    );
    expect(filtered.videos).toEqual([expect.objectContaining({ videoId: 'one' })]);
    expect(
      (await service.page('videos', { ...empty, searchTerm: '100%' }, input())).totalCount
    ).toBe(1);
    const facets = await service.tags({ ...empty, tagTerm: 'diy' }, input());
    expect(facets.allCount).toBe(3);
    expect(facets.tags).toContainEqual({ label: 'diy', count: 1 });
    expect(facets.tags.some((tag) => tag.label === 'All')).toBe(false);
    for (const statement of [
      'EXPLAIN QUERY PLAN SELECT video_id FROM videos ORDER BY creation_timestamp DESC,video_id DESC LIMIT 12',
      'EXPLAIN QUERY PLAN SELECT comment_id FROM comments ORDER BY timestamp DESC,comment_id DESC LIMIT 6',
      "EXPLAIN QUERY PLAN SELECT trim(t.value),count(*) FROM videos v,json_each('[' || replace(json_quote(v.tags), ',', '\",\"') || ']') t GROUP BY trim(t.value)",
      'EXPLAIN QUERY PLAN SELECT video_id,(SELECT SUM(a.views+3*a.likes) FROM home_activity a WHERE a.video_id=v.video_id AND a.hour>0) AS score FROM videos v ORDER BY score DESC LIMIT 12',
    ]) {
      expect((await repository.rows(sql.raw(statement))).length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(filtered)).not.toContain('secret');
  });

  it.each(['hot', 'new', 'recently-discussed', 'discussed', 'viewed'] as const)(
    'keeps %s descending across all video pages with stable ties',
    async (sortTerm) => {
      const now = Date.now();
      const records = Array.from({ length: 65 }, (_, index) => ({
        ...video('order-' + String(index).padStart(2, '0')),
        is_published: true,
        creation_timestamp: now - Math.floor(((index * 17) % 65) / 3) * 1000,
        views: Math.floor(((index * 7) % 65) / 3),
        comments: Math.floor(((index * 11) % 65) / 3),
        recent: now - Math.floor(((index * 13) % 65) / 3) * 1000,
        hot: Math.floor(((index * 19) % 65) / 3),
      }));
      await videos.createMany(records.map(({ recent: _recent, hot: _hot, ...record }) => record));
      await comments.createMany(records.map((record) => comment(record.video_id, record.recent)));
      await repository.write(
        sql`INSERT INTO home_activity(video_id,hour,views,likes) VALUES ${sql.join(
          records.map(
            (record) => sql`(${record.video_id},${Math.floor(now / 3_600_000)},${record.hot},0)`
          ),
          sql`, `
        )}`
      );
      const field = {
        hot: 'hot',
        new: 'creation_timestamp',
        'recently-discussed': 'recent',
        discussed: 'comments',
        viewed: 'views',
      } as const;
      const expected = [...records]
        .sort(
          (a, b) =>
            b[field[sortTerm]] - a[field[sortTerm]] ||
            b.creation_timestamp - a.creation_timestamp ||
            b.video_id.localeCompare(a.video_id)
        )
        .map((record) => record.video_id);
      const query = { ...empty, sortTerm };
      const first = await service.page('videos', query, input());
      const second = await service.page('videos', query, {
        cursor: first.nextCursor!,
        snapshot: first.snapshot,
        revision: first.revision,
      });
      const third = await service.page('videos', query, {
        cursor: second.nextCursor!,
        snapshot: second.snapshot,
        revision: second.revision,
      });
      expect([first.videos!.length, second.videos!.length, third.videos!.length]).toEqual([
        30, 30, 5,
      ]);
      expect(
        [...first.videos!, ...second.videos!, ...third.videos!].map((row) => row.videoId)
      ).toEqual(expected);
      expect(third.hasMore).toBe(false);
    }
  );

  it('orders recently discussed videos by newest comment with stable ties and unmentioned videos last', async () => {
    await videos.createMany([
      { ...video('old-active'), is_published: true, creation_timestamp: 1, comments: 100 },
      { ...video('newer-video'), is_published: true, creation_timestamp: 500, comments: 10 },
      { ...video('tie'), is_published: true, creation_timestamp: 600, comments: 1 },
      { ...video('no-comments'), is_published: true, creation_timestamp: 999 },
    ]);
    await comments.createMany([
      comment('old-active', 200),
      comment('old-active', 50),
      comment('newer-video', 100),
      comment('tie', 200),
    ]);
    const sort = { ...empty, sortTerm: 'recently-discussed' as const };
    const first = await service.page('videos', sort, input());
    expect(first.videos!.map((row) => row.videoId)).toEqual([
      'tie',
      'old-active',
      'newer-video',
      'no-comments',
    ]);
    await comments.create(comment('newer-video', 300));
    const refreshed = await service.page('videos', sort, input());
    expect(refreshed.videos!.map((row) => row.videoId)).toEqual([
      'newer-video',
      'tie',
      'old-active',
      'no-comments',
    ]);
    expect(refreshed.snapshot).not.toBe(first.snapshot);
  });

  it('pins video order and counters through concurrent changes, and rechecks revoked eligibility', async () => {
    await videos.createMany(
      Array.from({ length: 31 }, (_, index) => ({
        ...video('v' + String(index).padStart(2, '0'), 100),
        is_published: true,
        views: index,
      }))
    );
    const state = await service.state();
    const first = await service.page(
      'videos',
      { ...empty, sortTerm: 'viewed' },
      { cursor: 0, epoch: state.epoch, revision: state.revision }
    );
    await videos.incrementViewsBy('v00', 10000);
    const second = await service.page(
      'videos',
      { ...empty, sortTerm: 'viewed' },
      {
        cursor: first.nextCursor!,
        epoch: state.epoch,
        revision: first.revision,
        snapshot: first.snapshot,
      }
    );
    const third = await service.page(
      'videos',
      { ...empty, sortTerm: 'viewed' },
      {
        cursor: second.nextCursor!,
        epoch: state.epoch,
        revision: first.revision,
        snapshot: first.snapshot,
      }
    );
    const rows = [...first.videos!, ...second.videos!, ...third.videos!] as HomeVideo[];
    expect(rows).toHaveLength(31);
    expect(new Set(rows.map((row) => row.videoId)).size).toBe(31);
    expect(rows.at(-1)).toMatchObject({ videoId: 'v00', views: 0 });
    await videos.update('v15', { is_hidden: true });
    await expect(
      service.page(
        'videos',
        { ...empty, sortTerm: 'viewed' },
        {
          cursor: first.nextCursor!,
          epoch: state.epoch,
          revision: first.revision,
          snapshot: first.snapshot,
        }
      )
    ).rejects.toBeInstanceOf(HomeResetError);
    await expect(
      service.page(
        'videos',
        { ...empty, tagTerm: 'music' },
        { cursor: first.nextCursor!, snapshot: first.snapshot }
      )
    ).rejects.toBeInstanceOf(HomeResetError);
  });

  it('uses recent engagement for Hot and expires hourly activity without fabricating imported counters', async () => {
    await videos.createMany([
      { ...video('old'), is_published: true, views: 100000 },
      { ...video('active'), is_published: true },
    ]);
    await videos.incrementViewsBy('active', 10);
    const hot = await service.page('videos', { ...empty, sortTerm: 'hot' }, input());
    expect(hot.videos![0]).toMatchObject({ videoId: 'active' });
    const activity = await repository.rows<{ views: number }>(
      sql`SELECT views FROM home_activity WHERE video_id='active'`
    );
    expect(Number(activity[0]?.views)).toBe(10);
    await repository.write(sql`UPDATE home_activity SET hour=hour-49`);
    const changedQuery = { ...empty, sortTerm: 'hot' as const, searchTerm: 'Video' };
    const expired = await service.page('videos', changedQuery, input());
    expect(expired.videos![0]).toMatchObject({ videoId: 'old' });
  });

  it('includes stream badge metadata in comment pages for uploads, live streams and past streams', async () => {
    await videos.createMany([
      { ...video('upload'), is_published: true },
      { ...video('live'), is_live: true, is_streaming: true },
      { ...video('streamed'), is_live: true, is_streaming: false },
    ]);
    await comments.createMany(['upload', 'live', 'streamed'].map((id) => comment(id)));
    const page = await service.page('comments', empty, input());
    expect(page.comments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ videoId: 'upload', isLive: false, isStreaming: false }),
        expect.objectContaining({ videoId: 'live', isLive: true, isStreaming: true }),
        expect.objectContaining({ videoId: 'streamed', isLive: true, isStreaming: false }),
      ])
    );
  });

  it('pages every global comment in groups of ten with stable timestamp ties and a partial final page', async () => {
    await videos.createMany([
      { ...video('a'), is_published: true },
      { ...video('b'), is_live: true },
      { ...video('hidden'), is_hidden: true, is_published: true },
    ]);
    await comments.createMany(
      Array.from({ length: 23 }, (_, index) => comment(index % 2 ? 'a' : 'b', 1000))
    );
    await comments.create(comment('hidden', 2000));
    const state = await service.state();
    let page = await service.page('comments', empty, {
      cursor: 0,
      epoch: state.epoch,
      revision: state.commentsRevision,
    });
    expect(page.comments).toHaveLength(10);
    const rows = [...page.comments!] as HomeComment[];
    await comments.create(comment('a', 3000)); // Appears on refresh, not in the pinned older traversal.
    while (page.hasMore) {
      page = await service.page('comments', empty, {
        cursor: page.nextCursor!,
        epoch: state.epoch,
        revision: state.commentsRevision,
        snapshot: page.snapshot,
      });
      rows.push(...(page.comments! as HomeComment[]));
    }
    expect(rows).toHaveLength(23);
    expect(new Set(rows.map((row) => row.commentId)).size).toBe(23);
    expect(page.comments).toHaveLength(3);
    expect(rows.every((row) => row.videoId !== 'hidden')).toBe(true);
    expect(rows.map((row) => row.commentId)).toEqual(
      [...rows.map((row) => row.commentId)].sort((a, b) => b - a)
    );
  });

  it('has bounded snapshots, explicit expired-cursor resets, and searchable paginated tag options', async () => {
    await videos.create({
      ...video('many'),
      is_published: true,
      tags: Array.from({ length: 56 }, (_, index) => `tag${String(index).padStart(2, '0')}`).join(
        ','
      ),
    });
    const tags = await service.tags(empty, input());
    expect(tags.tags).toHaveLength(50);
    expect(tags.hasMore).toBe(true);
    const last = await service.tags(empty, { cursor: tags.nextCursor! });
    expect(last.tags).toHaveLength(6);
    expect(last.hasMore).toBe(false);
    expect((await service.tags({ ...empty, tagSearch: 'tag55' }, input())).tags).toEqual([
      { label: 'tag55', count: 1 },
    ]);
    const page = await service.page('videos', empty, input());
    await repository.write(sql`DELETE FROM home_snapshots WHERE snapshot=${page.snapshot}`);
    await expect(repository.page(page.snapshot, 1, 12, 'videos')).rejects.toBeInstanceOf(
      HomeResetError
    );
    const state = await service.state();
    await expect(
      service.page('videos', empty, { cursor: 0, epoch: 'replaced', revision: state.revision })
    ).rejects.toBeInstanceOf(HomeResetError);
  });

  it('publishes concurrent snapshots atomically and retains admitted cursors across unrelated searches', async () => {
    await videos.createMany(
      Array.from({ length: 60 }, (_, index) => ({ ...video('v' + index), is_published: true }))
    );
    const pages = await Promise.all([
      service.page('videos', empty, input()),
      service.page('videos', { ...empty, searchTerm: 'Video' }, input()),
    ]);
    expect(pages.every((page) => page.videos!.length === 30)).toBe(true);
    for (let index = 0; index < 34; index++) {
      await service.page('videos', { ...empty, tagTerm: 'missing' + index }, input());
    }
    const [count] = await repository.rows<{ count: number | string }>(
      sql`SELECT count(*) AS count FROM home_snapshots`
    );
    expect(Number(count?.count)).toBe(36);
    expect((await repository.page(pages[0]!.snapshot, 30, 30, 'videos')).items).toHaveLength(30);
    const orphans = await repository.rows(
      sql`SELECT snapshot FROM home_snapshot_rows WHERE snapshot NOT IN (SELECT snapshot FROM home_snapshots)`
    );
    expect(orphans).toEqual([]);
  });

  it('filters community comments by exact video tag, preserves pagination, and restores all comments', async () => {
    await videos.createMany([
      { ...video('tag-music'), tags: 'music, art', is_published: true },
      { ...video('tag-art'), tags: 'art', is_published: true },
      { ...video('tag-substring'), tags: 'music-video', is_published: true },
    ]);
    await comments.createMany([
      ...Array.from({ length: 12 }, (_, i) => comment('tag-music', 1000 + i)),
      comment('tag-art', 2000), comment('tag-substring', 3000),
    ]);
    const query = { ...empty, tagTerm: 'music' };
    const first = await service.page('comments', query, input());
    expect(first.totalCount).toBe(12);
    expect(first.comments).toHaveLength(10);
    expect(first.comments!.every((row) => row.videoId === 'tag-music')).toBe(true);
    const cursor = { cursor: first.nextCursor!, snapshot: first.snapshot, revision: first.revision };
    const second = await service.page('comments', query, cursor);
    expect(second.comments).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    await expect(service.page('comments', { ...empty, tagTerm: 'art' }, cursor)).rejects.toBeInstanceOf(HomeResetError);
    expect((await service.page('comments', empty, input())).totalCount).toBe(14);
    expect((await service.page('comments', { ...empty, tagTerm: 'art' }, input())).totalCount).toBe(13);
    expect((await service.page('comments', { ...empty, tagTerm: 'missing' }, input())).totalCount).toBe(0);
  });

  it('searches comment text independently, pages matches, and separates query-specific snapshots', async () => {
    await videos.create({ ...video('search-comments'), tags: 'music', is_published: true });
    await comments.createMany(
      Array.from({ length: 23 }, (_, i) => ({
        ...comment('search-comments', 1000 + i),
        comment_plain_text_sanitized:
          i < 22 ? 'Caf\u00e9 &amp; chips 100% ' + i : 'Something else ' + i,
      }))
    );
    const query = {
      ...empty,
      commentSearch: 'CAF\u00c9 & chips 100%',
      searchTerm: 'unmatched video title',
      tagTerm: 'music',
    };
    const first = await service.page('comments', query, input());
    expect(first.totalCount).toBe(22);
    expect(first.comments).toHaveLength(10);
    const second = await service.page('comments', query, {
      cursor: first.nextCursor!,
      snapshot: first.snapshot,
      revision: first.revision,
    });
    expect(second.comments).toHaveLength(10);
    const last = await service.page('comments', query, {
      cursor: second.nextCursor!,
      snapshot: second.snapshot,
      revision: first.revision,
    });
    expect(last.comments).toHaveLength(2);
    expect(last.hasMore).toBe(false);
    expect(
      (await service.page('comments', { ...empty, commentSearch: '100_' }, input())).totalCount
    ).toBe(0);
    await expect(
      service.page(
        'comments',
        { ...query, commentSearch: 'Something else' },
        { cursor: first.nextCursor!, snapshot: first.snapshot, revision: first.revision }
      )
    ).rejects.toBeInstanceOf(HomeResetError);
  });

  it('accepts new searches after ranking rollover while preserving pinned pages and cache versions', async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const labels = Array.from({ length: 56 }, (_, index) => `tag${String(index).padStart(2, '0')}`);
    await videos.createMany(
      Array.from({ length: 31 }, (_, index) => ({
        ...video('rollover' + index),
        title: 'Rollover video ' + index,
        tags: index === 0 ? labels.join(',') : 'tag00',
        is_published: true,
      }))
    );
    const old = await service.state();
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.decorate('optionalAuthenticate', async () => {});
    homeRoutes(app, { resolve: () => service } as never);
    const get = (kind: string, values: Record<string, string>) =>
      app.inject('/home/' + kind + '?' + new URLSearchParams(values));
    try {
      const firstResponse = await get('videos', {
        epoch: old.epoch,
        revision: old.revision,
        sortTerm: 'new',
      });
      expect(firstResponse.statusCode).toBe(200);
      const first = firstResponse.json();
      const tagsResponse = await get('tags', { epoch: old.epoch, revision: old.tagsRevision });
      expect(tagsResponse.statusCode).toBe(200);
      const tags = tagsResponse.json();
      now += 60_000;
      const current = await service.state();
      expect(current.revision).not.toBe(old.revision);
      expect(current.tagsRevision).toBe(old.tagsRevision);
      for (const sortTerm of ['hot', 'new', 'viewed', 'recently-discussed', 'discussed']) {
        const response = await get('videos', {
          epoch: old.epoch,
          revision: old.revision,
          sortTerm,
          searchTerm: 'Rollover',
          tagTerm: 'tag00',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().revision).toBe(current.revision);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      const next = await get('videos', {
        epoch: old.epoch,
        revision: first.revision,
        snapshot: first.snapshot,
        cursor: String(first.nextCursor),
        sortTerm: 'new',
      });
      expect(next.statusCode).toBe(200);
      expect(next.json().videos).toHaveLength(1);
      expect(next.json().revision).toBe(first.revision);
      expect(next.headers['cache-control']).toContain('s-maxage=3600');
      const restored = await get('videos', {
        epoch: old.epoch,
        revision: first.revision,
        snapshot: first.snapshot,
        sortTerm: 'new',
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().videos).toEqual(first.videos);
      const wrongSearch = await get('videos', {
        epoch: old.epoch,
        revision: first.revision,
        snapshot: first.snapshot,
        cursor: String(first.nextCursor),
        sortTerm: 'viewed',
      });
      expect(wrongSearch.statusCode).toBe(409);
      const tagPage = await get('tags', {
        epoch: old.epoch,
        revision: tags.revision,
        cursor: String(tags.nextCursor),
      });
      expect(tagPage.statusCode).toBe(200);
      expect(tagPage.json().tags).toHaveLength(6);
      expect(tagPage.headers['cache-control']).toContain('s-maxage=3600');
      const legacyTags = await get('tags', { epoch: old.epoch, revision: old.revision });
      expect(legacyTags.statusCode).toBe(200);
      expect(legacyTags.json().revision).toBe(current.tagsRevision);
      expect(legacyTags.headers['cache-control']).toBe('no-store');
      await videos.create({ ...video('changed-catalog'), is_published: true });
      const staleTags = await get('tags', {
        epoch: old.epoch,
        revision: tags.revision,
        cursor: String(tags.nextCursor),
      });
      expect(staleTags.statusCode).toBe(409);
      const newComments = await get('comments', {
        epoch: old.epoch,
        revision: old.commentsRevision,
        commentSearch: 'anything',
      });
      expect(newComments.statusCode).toBe(200);
      expect(newComments.json().revision).not.toBe(old.commentsRevision);
      expect(newComments.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('serves safe HTML and versioned public reads; failures, auth and fresh requests never cache', async () => {
    await videos.create({ ...video('a'), is_published: true });
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.decorate('optionalAuthenticate', async () => {});
    await app.register(view, { engine: { ejs }, root: resolve('public/views') });
    homeRoutes(app, { resolve: () => service } as never);
    try {
      const root = await app.inject('/?view=about');
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('backyard.tube');
      expect(root.body).toContain('home-model');
      expect(root.headers['cache-control']).toContain('s-maxage=30');
      const state = (await app.inject('/home/state')).json();
      const url =
        '/home/videos?' + new URLSearchParams({ epoch: state.epoch, revision: state.revision });
      const first = await app.inject(url);
      expect(first.statusCode).toBe(200);
      expect(first.headers['cache-control']).toContain('s-maxage=3600');
      for (const request of [
        { url: '/home/videos' },
        { url, headers: { authorization: 'Bearer token' } },
        { url: url + '&fresh=1' },
        { url: '/home/videos?cursor=-1' },
      ]) {
        const response = await app.inject(request);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      const bad = await app.inject('/home/videos?epoch=replaced&revision=' + state.revision);
      expect(bad.statusCode).toBe(409);
      expect(bad.headers['cache-control']).toBe('no-store');
      const before = await service.state();
      config.nodeSettings.nodeBulletin = ['Updated bulletin'];
      const after = await service.state();
      expect(before.settingsRevision).not.toBe(after.settingsRevision);
      const oldName = config.nodeSettings.nodeName;
      config.nodeSettings.nodeName = '</script><script>alert(1)</script>';
      try {
        const escaped = await app.inject('/');
        expect(escaped.body).not.toContain('</script><script>alert(1)');
        expect(escaped.body).toContain('\\u003c/script>');
      } finally {
        config.nodeSettings.nodeName = oldName;
      }
    } finally {
      await app.close();
    }
  });
});

it('upgrades homepage operational tables created before safety revisions existed', () => {
  const fixture = openTestDatabase();
  try {
    fixture.client.exec(
      'DROP TABLE home_state; DROP TABLE home_snapshots; CREATE TABLE home_state (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL, catalog BIGINT NOT NULL DEFAULT 0, stats BIGINT NOT NULL DEFAULT 0, comments BIGINT NOT NULL DEFAULT 0); CREATE TABLE home_snapshots (snapshot TEXT PRIMARY KEY, kind TEXT NOT NULL, revision TEXT NOT NULL, created BIGINT NOT NULL)'
    );
    provisionSQLiteHome(fixture.client);
    provisionSQLiteHome(fixture.client);
    expect(fixture.client.prepare('SELECT safety FROM home_state').get()).toEqual({ safety: 0 });
    expect(fixture.client.pragma('table_info(home_snapshots)')).toContainEqual(
      expect.objectContaining({ name: 'safety' })
    );
  } finally {
    fixture.close();
  }
});
