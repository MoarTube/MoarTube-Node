import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const watch = readFileSync('public/views/watch.ejs', 'utf8');
const home = readFileSync('public/javascript/home.js', 'utf8');
const opened: any[] = [];
function storeClass() {
  const first = watch.indexOf('new (class {', watch.indexOf('        commentStore()')) + 5;
  const last = watch.indexOf('})(this.VIDEO_ID);', first) + 1;
  return vm.runInNewContext('(' + watch.slice(first, last) + ')', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    setTimeout,
    Date,
    Math,
  });
}
async function store(Class: any) {
  const instance = new Class('video');
  opened.push(instance);
  await instance.ready;
  return instance;
}
const body = { commentId: 1, timestamp: 1, commentPlainTextSanitized: 'one' };
const coverage = [
  [0, 0],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
];
const cursor = {
  type: 'before',
  timestamp: Number.MAX_SAFE_INTEGER,
  beforeId: Number.MAX_SAFE_INTEGER,
};
function watchMethod(start: string, end: string) {
  const first = watch.indexOf('        ' + start);
  return vm.runInNewContext(
    '({' + watch.slice(first, watch.indexOf('        ' + end, first)) + '})',
    { Date }
  );
}
afterEach(() => {
  for (const value of opened.splice(0)) value.db?.close();
});

describe('comment owner and durable generation', () => {
  it('keeps coverage and bodies consistent when the prior owner clears during initialization', async () => {
    const Class = storeClass();
    const a = await store(Class);
    a.version = 1;
    a.epoch = 'epoch';
    await a.put([body], coverage);
    await a.serial;
    const operation = Class.prototype.operation;
    let clear: Promise<unknown> | undefined;
    Class.prototype.operation = function (stores: any, mode: any, action: any) {
      return operation.call(this, stores, mode, (tx: any) =>
        action(
          new Proxy(tx, {
            get(target, key) {
              if (key !== 'objectStore') {
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              }
              return (name: string) => {
                const result = target.objectStore(name);
                if (name !== 'state') return result;
                return new Proxy(result, {
                  get(target, key) {
                    if (key !== 'get') {
                      const value = Reflect.get(target, key);
                      return typeof value === 'function' ? value.bind(target) : value;
                    }
                    return (key: any) => {
                      const request = target.get(key);
                      request.addEventListener('success', () => {
                        if (!clear) clear = a.clear().catch(() => {});
                      });
                      return request;
                    };
                  },
                });
              };
            },
          })
        )
      );
    };
    const b = await store(Class);
    await clear;
    expect(b.version).toBe(1);
    expect((await b.page(cursor)).comments.map((row: any) => row.commentId)).toEqual([1]);
  });

  it('invalidates memory hits and coverage when another tab owns the durable cache', async () => {
    const Class = storeClass();
    const a = await store(Class);
    await a.put([body], coverage);
    await a.serial;
    const generation = a.generation;
    const b = await store(Class);
    await b.clear();
    expect(await a.get(1)).toBeUndefined();
    expect(await a.page(cursor)).toBeNull();
    expect(a.generation).toBeGreaterThan(generation);
    expect(a.version).toBeUndefined();
    expect(a.memory.size).toBe(0);
  });

  it('keeps the new durable generation and its bodies when a tab clears then refills', async () => {
    const Class = storeClass();
    const a = await store(Class);
    await a.put([body], coverage);
    await a.serial;
    const old = a.cacheGeneration;
    await a.clear();
    expect(a.cacheGeneration).not.toBe(old);
    a.version = 2;
    a.epoch = 'epoch';
    await a.put([{ ...body, commentPlainTextSanitized: 'two' }], coverage);
    await a.serial;
    const b = await store(Class);
    expect(b.cacheGeneration).toBe(a.cacheGeneration);
    expect((await b.get(1)).commentPlainTextSanitized).toBe('two');
    expect((await b.page(cursor)).comments).toHaveLength(1);
  });

  it('deletes saved reply pages along with a deleted comment', async () => {
    const a = await store(storeClass());
    await a.put([body]);
    await a.serial;
    await a.operation(['replies'], 'readwrite', (tx: any) =>
      tx.objectStore('replies').put({
        video: 'video',
        cacheGeneration: a.cacheGeneration,
        id: 1,
        cursor: 0,
        response: { replyIds: [2] },
      })
    );
    await a.remove([1]);
    expect(
      await a.operation(['replies'], 'readonly', (tx: any) =>
        tx.objectStore('replies').get(['video', 1, 0])
      )
    ).toBeUndefined();
  });
});

describe('comment freshness without a CDN', () => {
  it('checks visible idle comments without creating duplicate timers or polling suspended pages', async () => {
    let tick: () => void = () => {};
    const setInterval = vi.fn((callback) => {
      tick = callback;
      return 1;
    });
    const document = { visibilityState: 'visible' };
    const start = watch.indexOf('        startCommentFreshnessTimer()');
    const end = watch.indexOf('        setupCommentScrolling()', start);
    const methods = vm.runInNewContext('({' + watch.slice(start, end) + '})', {
      setInterval,
      document,
    });
    const receiver: any = { ensureCommentFreshness: vi.fn().mockResolvedValue(undefined) };
    methods.startCommentFreshnessTimer.call(receiver);
    methods.startCommentFreshnessTimer.call(receiver);
    expect(setInterval).toHaveBeenCalledOnce();
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 15000);
    tick();
    expect(receiver.ensureCommentFreshness).toHaveBeenCalledOnce();
    document.visibilityState = 'hidden';
    tick();
    document.visibilityState = 'visible';
    receiver.COMMENT_SUSPENDED = true;
    tick();
    expect(receiver.ensureCommentFreshness).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'checks overdue state and respects the deadline with CDN %s',
    async (cdnEnabled) => {
      const methods = watchMethod('async ensureCommentFreshness()', 'commentRequest(');
      const receiver: any = {
        INCOMING_PARAMETERS: { commentsData: { cdnEnabled } },
        COMMENT_STATE_CHECKED_AT: 1,
        commentStore: () => ({ version: 1, checkOwnership: async () => {} }),
        updateCommentTotal: vi.fn(),
        syncCommentCache: vi.fn(async () => {
          receiver.COMMENT_STATE_CHECKED_AT = Date.now();
          return {};
        }),
      };
      await methods.ensureCommentFreshness.call(receiver);
      await methods.ensureCommentFreshness.call(receiver);
      expect(receiver.syncCommentCache).toHaveBeenCalledOnce();
    }
  );

  it('reads origin state before deciding no synchronization is needed without CDN', async () => {
    const methods = watchMethod('async performCommentCacheSync(', 'commentDeferred(');
    const readCommentState = vi.fn(async () => ({ epoch: 'epoch', version: 2, totalCount: 10 }));
    const commentRequest = vi.fn();
    const receiver = {
      INCOMING_PARAMETERS: { commentsData: { cdnEnabled: false } },
      commentStore: () => ({ ready: Promise.resolve(), epoch: 'epoch', version: 2 }),
      readCommentState,
      commentRequest,
    };
    expect(await methods.performCommentCacheSync.call(receiver, false)).toMatchObject({
      totalCount: 10,
    });
    expect(readCommentState).toHaveBeenCalledWith(false);
    expect(commentRequest).not.toHaveBeenCalled();
  });

  it('checks freshness before restoring observers on pageshow and visibility return', async () => {
    const events = new Map<string, any>();
    const document = {
      visibilityState: 'visible',
      addEventListener: (event: string, callback: any) => events.set(event, callback),
    };
    const observeCommentSentinels = vi.fn();
    let release: () => void = () => {};
    const receiver: any = {
      observeCommentSentinels,
      startCommentFreshnessTimer: vi.fn(),
      ensureCommentFreshness: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      ),
    };
    const start = watch.indexOf('          const resumeComments =');
    const end = watch.indexOf('\n        }', start);
    const bind = vm.runInNewContext('(function(){' + watch.slice(start, end) + '})', {
      document,
      window: { addEventListener: (event: string, callback: any) => events.set(event, callback) },
    });
    bind.call(receiver);
    events.get('pageshow')();
    expect(receiver.COMMENT_STATE_CHECKED_AT).toBe(0);
    expect(observeCommentSentinels).not.toHaveBeenCalled();
    release();
    await Promise.resolve();
    expect(observeCommentSentinels).toHaveBeenCalledOnce();
    events.get('visibilitychange')();
    expect(receiver.ensureCommentFreshness).toHaveBeenCalledTimes(2);
    release();
    await Promise.resolve();
    document.visibilityState = 'hidden';
    events.get('visibilitychange')();
    expect(receiver.ensureCommentFreshness).toHaveBeenCalledTimes(2);
  });
});

describe('homepage first-page snapshot restoration', () => {
  it('pins the video restoration request to the returned snapshot after the initial response', async () => {
    let restore: any;
    const read = vi.fn(async () => ({
      videos: [1],
      epoch: 'new-epoch',
      revision: 'new-revision',
      snapshot: 'frozen',
      nextCursor: 30,
      hasMore: true,
    }));
    const context = vm.createContext({
      initialized: true,
      videosLoading: false,
      videosMore: true,
      videoGeneration: 0,
      videoCursor: 0,
      videoSnapshot: undefined,
      videoRevision: 'old',
      query: { view: 'videos' },
      mobile: { matches: false },
      retryPending: () => false,
      clearRetry: () => {},
      maybeLoad: () => {},
      $: () => ({}),
      params: (revision: any, extra: any) => ({ epoch: 'old-epoch', revision, ...extra }),
      read,
      videoCard: () => {},
      mountPage: (_container: any, _items: any, _render: any, load: any) => {
        restore = load;
      },
    });
    const start = home.indexOf('  async function loadVideos()');
    const end = home.indexOf('  async function refreshVideos()', start);
    const load = vm.runInContext(home.slice(start, end) + '\nloadVideos;', context);
    await load();
    await restore();
    expect(read.mock.calls.at(-1)).toEqual([
      'videos',
      expect.objectContaining({
        epoch: 'new-epoch',
        revision: 'new-revision',
        snapshot: 'frozen',
        cursor: 0,
      }),
    ]);
  });

  it('pins the community page metadata used for later restoration', async () => {
    const pages: any[] = [];
    const read = vi.fn(async () => ({
      comments: [1],
      epoch: 'new-epoch',
      revision: 'new-revision',
      snapshot: 'frozen',
      nextCursor: 10,
      hasMore: true,
      totalCount: 11,
    }));
    const context = vm.createContext({
      initialized: true,
      commentsLoading: false,
      commentGeneration: 0,
      commentPages: pages,
      commentSnapshot: undefined,
      commentRevision: 'old',
      commentIndex: 0,
      query: { view: 'community' },
      mobile: { matches: false },
      retryPending: () => false,
      clearRetry: () => {},
      commentButtons: () => {},
      maybeLoad: () => {},
      renderComments: () => {},
      $: () => ({}),
      document: { querySelectorAll: () => [] },
      params: (revision: any, extra: any) => ({ epoch: 'old-epoch', revision, ...extra }),
      read,
    });
    const start = home.indexOf('  async function loadComments(');
    const end = home.indexOf('  async function refreshComments(', start);
    const load = vm.runInContext(home.slice(start, end) + '\nloadComments;', context);
    await load();
    expect(pages[0].input).toMatchObject({
      epoch: 'new-epoch',
      revision: 'new-revision',
      snapshot: 'frozen',
      cursor: 0,
    });
  });
});
