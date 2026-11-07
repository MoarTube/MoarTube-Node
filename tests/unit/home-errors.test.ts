import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { HomeRepository, HomeResetError, type HomeQuery } from '@/database/repositories/home.js';
import { HomeService } from '@/services/home.js';
import { homeRoutes } from '@/routes/home.js';

const query: HomeQuery = { searchTerm: '', tagTerm: '', tagSearch: '', sortTerm: 'new' };
const state = { epoch: 'epoch', catalog: 1, comments: 1, stats: 1, safety: 1 };
afterEach(() => vi.restoreAllMocks());

it('rejects missing state, unsafe snapshots, and results invalidated during a page read', async () => {
  const db = { all: vi.fn().mockReturnValue([]), run: vi.fn() };
  const repository = new HomeRepository(db as never, 'sqlite');
  await expect(repository.state()).rejects.toThrow('not installed');
  db.all.mockReturnValueOnce([{ created: Date.now(), safety: 2 }]);
  await expect(
    repository.ensureSnapshot('id', 'rev', 'videos', query, Date.now(), 1)
  ).rejects.toBeInstanceOf(HomeResetError);
  db.all.mockReturnValueOnce([{ created: 0, safety: 1 }]);
  await repository.ensureSnapshot('id', 'rev', 'videos', query, Date.now(), 1);
  expect(db.run).toHaveBeenCalledOnce();
  db.all
    .mockReturnValueOnce([{ snapshot: 'id' }])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([{ count: 0 }])
    .mockReturnValueOnce([]);
  await expect(repository.page('id', 0, 30, 'videos')).rejects.toThrow(
    'Results changed while loading'
  );
});

it('returns empty counts when a driver returns no aggregate row', async () => {
  const db = { all: vi.fn().mockReturnValue([]) };
  const repository = new HomeRepository(db as never, 'sqlite');
  db.all
    .mockReturnValueOnce([{ snapshot: 'id' }])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([{ snapshot: 'id' }]);
  expect(await repository.page('id', 0, 30, 'comments')).toMatchObject({
    items: [],
    totalCount: 0,
    hasMore: false,
  });
  expect(await repository.tags(query, 0)).toEqual({
    tags: [],
    allCount: 0,
    hasMore: false,
    nextCursor: null,
  });
});

it('resets a new snapshot when data changes while it is built, and requires a snapshot for continuation', async () => {
  const repository = {
    state: vi.fn().mockResolvedValue(state),
    ensureSnapshot: vi.fn(),
    page: vi.fn(),
  };
  const service = new HomeService(repository as never);
  vi.spyOn(service, 'settings').mockReturnValue({ nodeName: 'Test' } as never);
  repository.state.mockResolvedValueOnce(state).mockResolvedValueOnce({ ...state, comments: 2 });
  await expect(service.page('videos', query, { cursor: 0 })).rejects.toThrow(
    'Results changed while loading'
  );
  expect(repository.page).not.toHaveBeenCalled();
  await expect(service.page('comments', query, { cursor: 5 })).rejects.toThrow(
    'snapshot is required'
  );
});

it('rejects stale tag epochs and catalog changes during tag reads', async () => {
  const repository = {
    state: vi.fn().mockResolvedValue(state),
    tags: vi.fn().mockResolvedValue({ tags: [] }),
  };
  const service = new HomeService(repository as never);
  vi.spyOn(service, 'settings').mockReturnValue({ nodeName: 'Test' } as never);
  await expect(service.tags(query, { cursor: 0, epoch: 'old' })).rejects.toThrow(
    'Refresh the tag catalog'
  );
  repository.state.mockResolvedValueOnce(state).mockResolvedValueOnce({ ...state, catalog: 2 });
  await expect(service.tags(query, { cursor: 0 })).rejects.toThrow('changed while loading');
});

it('serves versioned settings, rejects stale or racing settings, and never caches failed reads', async () => {
  const revision = 'a'.repeat(64);
  const current = { epoch: 'epoch', settingsRevision: revision };
  const service = {
    state: vi.fn().mockResolvedValue(current),
    settings: vi.fn().mockReturnValue({ nodeName: 'Saved node' }),
  };
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.decorate('optionalAuthenticate', async () => {});
  homeRoutes(app, { resolve: () => service } as never);
  try {
    for (const suffix of [
      '',
      '?epoch=epoch',
      '?revision=' + revision,
      '?epoch=epoch&revision=' + revision,
    ]) {
      const response = await app.inject('/home/settings' + suffix);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        settings: { nodeName: 'Saved node' },
        epoch: 'epoch',
        revision,
      });
    }
    for (const suffix of ['?epoch=old', '?revision=' + 'b'.repeat(64)]) {
      const response = await app.inject('/home/settings' + suffix);
      expect(response.statusCode).toBe(409);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    service.state
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, settingsRevision: 'b'.repeat(64) });
    const changed = await app.inject('/home/settings');
    expect(changed.statusCode).toBe(409);
    expect(changed.json().message).toContain('changed while loading');
    service.state.mockRejectedValueOnce(new Error('Database offline'));
    const failed = await app.inject('/home/state');
    expect(failed.statusCode).toBe(500);
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(failed.json().message).toContain('Please retry');
  } finally {
    await app.close();
  }
});
