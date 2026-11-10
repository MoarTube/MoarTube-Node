import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import {
  HomeCapacityError,
  HomeRepository,
  HOME_SNAPSHOT_LIMITS,
  type HomeSnapshotLimits,
} from '@/database/repositories/home.js';
import { HomeService } from '@/services/home.js';
import { HomeController } from '@/controllers/home.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { openTestDatabase, video } from '../integration/sqlite/helpers.js';

vi.mock('@/config/index.js', () => ({
  getConfig: () => ({ nodeSettings: { storageConfig: { storageMode: 'filesystem' } } }),
}));

let database: ReturnType<typeof openTestDatabase>;
const query = { searchTerm: '', tagTerm: '', tagSearch: '', sortTerm: 'new' as const };
beforeEach(() => {
  database = openTestDatabase();
});
afterEach(() => {
  vi.restoreAllMocks();
  database.close();
});
function repository(limits: Partial<HomeSnapshotLimits> = {}) {
  return new HomeRepository(database.db, 'sqlite', { ...HOME_SNAPSHOT_LIMITS, ...limits });
}
async function seed(count: number) {
  await createVideosRepository('sqlite', database.db).createMany(
    Array.from({ length: count }, (_, i) => ({ ...video('video-' + i, i + 1), is_published: true }))
  );
}
async function counts() {
  const [meta] = await repository().rows<{ count: number }>(
    sql`SELECT COUNT(*) AS count FROM home_snapshots`
  );
  const [rows] = await repository().rows<{ count: number }>(
    sql`SELECT COUNT(*) AS count FROM home_snapshot_rows`
  );
  return [meta!.count, rows!.count];
}

it('rejects oversized searches before publishing any partial snapshot, while narrower searches work', async () => {
  await seed(4);
  const service = new HomeService(repository({ rows: 3 }));
  await expect(service.page('videos', query, { cursor: 0 })).rejects.toMatchObject({
    oversized: true,
  });
  expect(await counts()).toEqual([0, 0]);
  expect(
    (await service.page('videos', { ...query, searchTerm: 'video-1' }, { cursor: 0 })).totalCount
  ).toBe(1);
});

it('bounds encoded snapshot bytes and leaves no orphan bodies after an oversized result', async () => {
  await seed(1);
  await createVideosRepository('sqlite', database.db).update('video-0', {
    title: '界'.repeat(400),
  });
  const service = new HomeService(repository({ bytes: 1024 }));
  await expect(service.page('videos', query, { cursor: 0 })).rejects.toBeInstanceOf(
    HomeCapacityError
  );
  expect(await counts()).toEqual([0, 0]);
});

it('retains an admitted cursor when a competing search cannot fit the shared row budget', async () => {
  await seed(35);
  const repo = repository({ totalRows: 35 });
  const service = new HomeService(repo);
  const first = await service.page('videos', query, { cursor: 0 });
  await expect(
    service.page('videos', { ...query, sortTerm: 'viewed' }, { cursor: 0 })
  ).rejects.toMatchObject({ oversized: false });
  const second = await service.page('videos', query, {
    cursor: first.nextCursor!,
    snapshot: first.snapshot,
    epoch: first.epoch,
    revision: first.revision,
  });
  expect(second.videos).toHaveLength(5);
  expect(await counts()).toEqual([1, 35]);
});

it('bounds metadata-only searches without evicting an admitted cursor', async () => {
  await seed(1);
  const repo = repository({ snapshots: 2 });
  const service = new HomeService(repo);
  const first = await service.page('videos', query, { cursor: 0 });
  await service.page('videos', { ...query, searchTerm: 'missing-a' }, { cursor: 0 });
  await expect(
    service.page('videos', { ...query, searchTerm: 'missing-b' }, { cursor: 0 })
  ).rejects.toMatchObject({ oversized: false });
  expect((await repo.page(first.snapshot, 0, 30, 'videos')).items).toHaveLength(1);
  expect(await counts()).toEqual([2, 1]);
});

it('enforces a shared byte budget and releases expired reservations before admitting new searches', async () => {
  await seed(1);
  const firstRepo = repository();
  const first = await new HomeService(firstRepo).page('videos', query, { cursor: 0 });
  const [size] = await firstRepo.rows<{ bytes: number }>(
    sql`SELECT byte_count AS bytes FROM home_snapshots`
  );
  const service = new HomeService(repository({ totalBytes: size!.bytes }));
  await expect(
    service.page('videos', { ...query, sortTerm: 'viewed' }, { cursor: 0 })
  ).rejects.toMatchObject({ oversized: false });
  await firstRepo.write(sql`UPDATE home_snapshots SET created=0 WHERE snapshot=${first.snapshot}`);
  expect(
    (await service.page('videos', { ...query, sortTerm: 'viewed' }, { cursor: 0 })).videos
  ).toHaveLength(1);
  expect(await counts()).toEqual([1, 1]);
});

it('deduplicates concurrent same-snapshot builders without double-reserving capacity', async () => {
  await seed(35);
  const service = new HomeService(repository({ totalRows: 35, snapshots: 1 }));
  const pages = await Promise.all([
    service.page('videos', query, { cursor: 0 }),
    service.page('videos', query, { cursor: 0 }),
  ]);
  expect(pages[0]!.snapshot).toBe(pages[1]!.snapshot);
  expect(await counts()).toEqual([1, 35]);
});

it('rolls back the capacity reservation when publishing a body fails', async () => {
  await seed(1);
  database.client.exec(
    "CREATE TRIGGER reject_snapshot_body BEFORE INSERT ON home_snapshot_rows BEGIN SELECT RAISE(ABORT, 'publication failed'); END"
  );
  await expect(new HomeService(repository()).page('videos', query, { cursor: 0 })).rejects.toMatchObject({
    cause: { message: 'publication failed' },
  });
  expect(await counts()).toEqual([0, 0]);
});

it('rebuilds an expired same-identity snapshot atomically instead of renewing obsolete bodies', async () => {
  await seed(1);
  const repo = repository();
  await repo.ensureSnapshot('same', 'revision', 'videos', query, Date.now(), 0);
  await repo.write(sql`UPDATE home_snapshots SET created=0 WHERE snapshot='same'`);
  await createVideosRepository('sqlite', database.db).update('video-0', { views: 9 });
  await repo.ensureSnapshot('same', 'revision', 'videos', query, Date.now(), 0);
  expect((await repo.page('same', 0, 30, 'videos')).items[0]).toMatchObject({ views: 9 });
  expect(await counts()).toEqual([1, 1]);
});

it.each([true, false])(
  'returns a friendly uncached capacity response (oversized=%s)',
  async (oversized) => {
    const app = Fastify();
    const controller = new HomeController({
      page: async () => {
        throw new HomeCapacityError(oversized);
      },
    } as never);
    app.get('/home/videos', controller.read('videos'));
    try {
      const response = await app.inject('/home/videos');
      expect(response.statusCode).toBe(oversized ? 413 : 503);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['retry-after']).toBe(oversized ? undefined : '30');
      expect(response.json().message).toMatch(oversized ? /search term/ : /retry/);
    } finally {
      await app.close();
    }
  }
);
