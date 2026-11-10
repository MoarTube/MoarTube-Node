import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const watch = readFileSync('public/views/watch.ejs', 'utf8');
const first = watch.indexOf('new (class {', watch.indexOf('        commentStore()')) + 5;
const last = watch.indexOf('})(this.VIDEO_ID);', first) + 1;
const databases: any[] = [];
function storeClass(indexedDB = new IDBFactory()) {
  return vm.runInNewContext('(' + watch.slice(first, last) + ')', {
    indexedDB,
    IDBKeyRange,
    setTimeout,
    Date,
    Math,
  });
}
async function store(Class: any, video = 'video') {
  const value = new Class(video);
  await value.ready;
  databases.push(value);
  return value;
}
afterEach(() => {
  for (const s of databases.splice(0)) s.db?.close();
});
const row = (id: number, text = 'body') => ({
  commentId: id,
  timestamp: id,
  commentPlainTextSanitized: text,
});

describe('persistent comment cache bounds and ownership', () => {
  it('creates the new bounded cache schema', async () => {
    const current = await store(storeClass());
    expect(current.db.name).toBe('moartube-comments-v2');
    expect(current.db.version).toBe(1);
    expect(Array.from(current.db.objectStoreNames)).toEqual(['comments', 'replies', 'state']);
  });
  it('commits bodies and coverage together and reads the next page from disk', async () => {
    const Class = storeClass();
    const a = await store(Class);
    a.version = 1;
    a.epoch = 'epoch';
    await a.put(
      [row(1), row(2)],
      [
        [0, 0],
        [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      ]
    );
    await a.serial;
    const b = await store(Class);
    expect(b.version).toBe(1);
    expect((await b.get(1)).commentPlainTextSanitized).toBe('body');
    expect(b.ranges).toHaveLength(1);
  });
  it('prevents a superseded tab from writing obsolete bodies or coverage', async () => {
    const Class = storeClass();
    const a = await store(Class);
    await a.put([row(1, 'original')]);
    await a.serial;
    const b = await store(Class);
    await b.put([row(1, 'updated')]);
    await b.serial;
    await a.put([row(1, 'obsolete')]);
    await a.serial;
    expect(a.db).toBeNull();
    const c = await store(Class);
    expect((await c.get(1)).commentPlainTextSanitized).toBe('updated');
  });
  it('evicts persistent bodies and coverage together when the per-video row limit is reached', async () => {
    const Class = storeClass();
    const a = await store(Class);
    await a.put(
      Array.from({ length: 2001 }, (_, i) => row(i + 1)),
      [
        [0, 0],
        [9999, 9999],
      ]
    );
    await a.serial;
    expect(a.db).toBeNull();
    expect(a.ranges).toHaveLength(0);
    expect(a.memory.size).toBeLessThanOrEqual(500);
    const b = await store(Class);
    expect(await b.get(1)).toBeUndefined();
    expect(b.ranges).toHaveLength(0);
  });
  it('enforces a per-video byte limit and falls back safely when persistence is unavailable', async () => {
    const a = await store(storeClass());
    await a.put([row(1, 'x'.repeat(3 * 1024 * 1024))]);
    await a.serial;
    expect(a.db).toBeNull();
    const b = await store(
      storeClass({
        open() {
          throw new Error('storage disabled');
        },
      } as any)
    );
    await b.put([row(2)]);
    await b.serial;
    expect((await b.get(2)).commentId).toBe(2);
  });
  it('bounds reply pages in the same transaction as their coverage', async () => {
    const a = await store(storeClass());
    await a.operation(['replies'], 'readwrite', (tx: any) => {
      for (let cursor = 0; cursor < 201; cursor++)
        tx.objectStore('replies').put({ video: 'video', id: 1, cursor, response: {} });
    });
    expect(a.db).toBeNull();
    expect(a.ranges).toHaveLength(0);
  });
  it('enforces the global video bound inside writes, including concurrent tab initialization', async () => {
    const Class = storeClass();
    const tabs = await Promise.all(
      Array.from({ length: 25 }, (_, i) => store(Class, 'video-' + i))
    );
    const latest = tabs.at(-1);
    const states = await latest.operation(['state'], 'readonly', (tx: any) =>
      tx.objectStore('state').getAll()
    );
    expect(states.length).toBeLessThanOrEqual(20);
  });
});

describe('homepage cache', () => {
  const source = readFileSync('public/javascript/home.js', 'utf8');
  const classSource = source.slice(
    source.indexOf('  class PageCache {'),
    source.indexOf('  const cache = new PageCache();')
  );
  function cache(fetch: any) {
    const Class = vm.runInNewContext(classSource + '\nPageCache;', {
      indexedDB: {
        open() {
          throw new Error('disabled');
        },
      },
      fetch,
      URLSearchParams,
      AbortSignal,
      Date,
    });
    return new Class();
  }
  it('subtracts CDN Age from persistent lifetime', async () => {
    const c = cache(async () => ({
      ok: true,
      headers: new Headers({ 'Cache-Control': 'public, s-maxage=3600', Age: '3600' }),
      json: async () => ({ videos: [] }),
    }));
    await c.read('/home/videos', { revision: 'r' });
    expect(await c.get('/home/videos?revision=r')).toBeNull();
  });
  it('rejects a response in flight when safety invalidation clears the cache', async () => {
    let finish: any;
    const c = cache(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = c.read('/home/videos', { revision: 'r' }, false);
    await c.clear();
    finish({ ok: true, headers: new Headers(), json: async () => ({ videos: [] }) });
    await expect(pending).rejects.toMatchObject({ reset: true });
  });
  it('checks freshness before a body hit and refuses an input from a revoked generation', async () => {
    const c = { generation: 0, read: vi.fn() };
    const context = vm.createContext({
      initialized: true,
      cache: c,
      ensureHomeFreshness: vi.fn(async () => {
        c.generation++;
      }),
    });
    const start = source.indexOf('  const read = async (kind');
    const end = source.indexOf('  function params(', start);
    const read = vm.runInContext(source.slice(start, end) + '\nread;', context);
    await expect(read('videos', { revision: 'obsolete' })).rejects.toMatchObject({ reset: true });
    expect(c.read).not.toHaveBeenCalled();
  });
  it('clears cached/rendered pages on safety changes and applies changed settings', async () => {
    const previous = { epoch: 'one', safetyRevision: 1, settingsRevision: 'old' };
    const clear = vi.fn(async () => {});
    const settings = vi.fn();
    const replaceChildren = vi.fn();
    const context = vm.createContext({
      state: previous,
      appliedSafety: previous,
      appliedSettings: 'old',
      stateCheckedAt: 0,
      freshnessTask: undefined,
      Date,
      freshState: async () => {
        context.state = {
          ...previous,
          safetyRevision: 2,
          settingsRevision: 'new',
          commentsRevision: 'new-comments',
        };
      },
      read: async () => ({ settings: { nodeName: 'updated' } }),
      params: () => ({}),
      settings,
      cache: { clear },
      resetVideos: vi.fn(),
      commentGeneration: 0,
      commentsLoading: false,
      commentIndex: 1,
      commentPages: ['old'],
      commentSnapshot: 'old',
      commentRevision: 'old',
      $: () => ({ replaceChildren }),
      loadComments: vi.fn(),
      loadTags: vi.fn(),
    });
    const start = source.indexOf('  function ensureHomeFreshness(');
    const end = source.indexOf('  const resume =', start);
    const ensure = vm.runInContext(source.slice(start, end) + '\nensureHomeFreshness;', context);
    await ensure();
    expect(clear).toHaveBeenCalledOnce();
    expect(replaceChildren).toHaveBeenCalledOnce();
    expect(context.commentPages).toHaveLength(0);
    expect(settings).toHaveBeenCalledWith({ nodeName: 'updated' });
    expect(context.appliedSafety.safetyRevision).toBe(2);
  });
  it('refreshes tags after a catalog insert without invalidating admitted paging snapshots', async () => {
    const state = {
      epoch: 'one',
      safetyRevision: 1,
      settingsRevision: 'same',
      tagsRevision: 'old',
    };
    const clear = vi.fn(),
      resetVideos = vi.fn(),
      loadTags = vi.fn();
    const context = vm.createContext({
      state,
      appliedSafety: state,
      appliedSettings: 'same',
      stateCheckedAt: 0,
      freshnessTask: undefined,
      Date,
      freshState: async () => {
        context.state = { ...state, tagsRevision: 'new' };
      },
      cache: { clear },
      resetVideos,
      loadTags,
    });
    const start = source.indexOf('  function ensureHomeFreshness(');
    const end = source.indexOf('  const resume =', start);
    await vm.runInContext(source.slice(start, end) + '\nensureHomeFreshness;', context)();
    expect(loadTags).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(resetVideos).not.toHaveBeenCalled();
  });
});
