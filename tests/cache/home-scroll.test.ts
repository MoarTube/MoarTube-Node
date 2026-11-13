import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/javascript/home.js', 'utf8');
function section(start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error('Homepage section not found');
  return source.slice(first, last);
}

// Run the actual paging, cache, observer and virtualization code with controlled
// viewport geometry and HTTP responses, without requiring a running node server.
function scrolling(mobile = false, view = 'videos') {
  class Element {
    children: any[] = [];
    style = { minHeight: '' };
    dataset: Record<string, string> = {};
    isConnected = true;
    textContent = '';
    hidden = false;
    disabled = false;
    rect = { width: 600, height: 600, top: 0, bottom: 600 };
    constructor(public id = '', public className = '') {}
    get childElementCount() { return this.children.length; }
    append(...items: any[]) { this.children.push(...items); }
    replaceChildren(...items: any[]) { this.children = items; }
    contains() { return false; }
    getBoundingClientRect() { return this.rect; }
  }
  const elements = new Map<string, Element>();
  const $ = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id)!;
  };
  const frames: (() => void)[] = [];
  const events = new Map<string, () => void>();
  const observed: Element[] = [];
  let intersect: () => void = () => {};
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    const videos = url.pathname === '/home/videos';
    const cursor = Number(url.searchParams.get('cursor') || 0);
    const size = videos ? 30 : 10;
    const total = videos ? 65 : 25;
    const count = Math.min(size, total - cursor);
    const sentinel = $(videos ? 'video-sentinel' : 'comment-sentinel');
    sentinel.rect.top += count * (videos ? 20 : 120);
    sentinel.rect.bottom = sentinel.rect.top + 2;
    return {
      ok: true,
      headers: new Headers({ 'Cache-Control': 'public, s-maxage=3600' }),
      json: async () => ({
        [videos ? 'videos' : 'comments']: Array.from({ length: count }, (_, i) => ({ id: cursor + i })),
        epoch: 'epoch', revision: 'revision', snapshot: 'snapshot',
        hasMore: cursor + count < total,
        nextCursor: cursor + count < total ? cursor + count : null,
        totalCount: total,
      }),
    };
  });
  $('video-sentinel').rect = { width: view === 'videos' ? 600 : 0, height: 2, top: 0, bottom: 2 };
  $('comment-sentinel').rect = { width: view === 'community' ? 600 : 0, height: 2, top: 0, bottom: 2 };
  const failure = vi.fn();
  const context = vm.createContext({
    model: { state: { epoch: 'epoch' }, query: { view, searchTerm: 'cats', tagTerm: 'pets', sortTerm: 'new' } },
    $, mobile: { matches: mobile }, innerHeight: 600,
    indexedDB: { open() { throw new Error('Persistence disabled'); } },
    fetch, Headers, URLSearchParams, AbortSignal, Date,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
    IntersectionObserver: class {
      constructor(callback: () => void, options: any) {
        intersect = callback;
        expect(options.rootMargin).toBe('400px');
      }
      observe(element: Element) { observed.push(element); }
    },
    document: {
      activeElement: null,
      querySelector: $,
      querySelectorAll: () => $('comment-list').children,
    },
    node: (_tag: string, className: string) => new Element('', className),
    videoCard: (item: any) => item,
    commentCard: (item: any) => item,
    retryPending: () => false, clearRetry: () => {}, failure,
  });
  vm.runInContext([
    section('  class PageCache {', '  const retries ='),
    'initialized = true; videoRevision = commentRevision = "revision";',
    section('  const virtualPages =', '  async function refreshVideos()'),
    section('  function commentButtons()', '  async function refreshComments('),
    section('  function visible(', '  function settings('),
  ].join('\n'), context);
  async function settle() {
    for (let i = 0; i < 30; i++) {
      frames.splice(0).forEach((callback) => callback());
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (!frames.length && !vm.runInContext('videosLoading || commentsLoading || [...virtualPages].some(p => p.loading)', context)) break;
    }
    expect(failure).not.toHaveBeenCalled();
  }
  async function approach(id: string, top = 999) {
    $(id).rect.top = top;
    $(id).rect.bottom = top + 2;
    // Repeated observer notifications must not issue duplicate requests.
    intersect();
    intersect();
    await settle();
  }
  return { $, context, fetch, observed, events, settle, approach };
}

describe('homepage scroll loading', () => {
  it.each([false, true])('preserves video order across scroll pages (mobile: %s)', async (mobile) => {
    const app = scrolling(mobile);
    expect(app.observed.map((element) => element.id)).toEqual(['video-sentinel', 'comment-sentinel']);
    await app.approach('video-sentinel', 0);
    expect(app.$('video-grid').children.map((page) => page.childElementCount)).toEqual([30, 30]);
    const first = new URL(app.fetch.mock.calls[0][0], 'http://localhost');
    const second = new URL(app.fetch.mock.calls[1][0], 'http://localhost');
    expect(first.pathname).toBe('/home/videos');
    expect(first.searchParams.get('cursor')).toBe('0');
    expect(second.searchParams.get('cursor')).toBe('30');
    expect(second.searchParams.get('snapshot')).toBe('snapshot');
    for (const url of [first, second]) {
      expect(url.searchParams.get('searchTerm')).toBe('cats');
      expect(url.searchParams.get('tagTerm')).toBe('pets');
      expect(url.searchParams.get('sortTerm')).toBe('new');
    }
    await app.approach('video-sentinel', 1000);
    expect(app.fetch).toHaveBeenCalledTimes(2);
    await app.approach('video-sentinel');
    expect(app.$('video-grid').children.map((page) => page.childElementCount)).toEqual([30, 30, 5]);
    expect(new URL(app.fetch.mock.calls[2][0], 'http://localhost').searchParams.get('cursor')).toBe('60');
    expect(app.$('video-grid').children.flatMap((page) => page.children.map((item) => item.id)))
      .toEqual(Array.from({ length: 65 }, (_, index) => index));
    await app.approach('video-sentinel');
    expect(app.fetch).toHaveBeenCalledTimes(3);
  });

  it('appends mobile community comments in batches of ten and stops at the end', async () => {
    const app = scrolling(true, 'community');
    await app.approach('comment-sentinel', 0);
    await app.approach('comment-sentinel');
    await app.approach('comment-sentinel');
    expect(app.$('comment-list').children.map((page) => page.childElementCount)).toEqual([10, 10, 5]);
    expect(app.fetch.mock.calls.map(([input]) => {
      const url = new URL(input, 'http://localhost');
      expect(url.pathname).toBe('/home/comments');
      expect(url.searchParams.get('tagTerm')).toBe('pets');
      return url.searchParams.get('cursor');
    })).toEqual(['0', '10', '20']);
    await app.approach('comment-sentinel');
    expect(app.fetch).toHaveBeenCalledTimes(3);
  });

  it('leaves desktop comments on manual pagination', async () => {
    const app = scrolling(false, 'community');
    await app.approach('comment-sentinel', 0);
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it('restores unloaded video cards from the page cache when scrolling back', async () => {
    const app = scrolling();
    await app.approach('video-sentinel', 0);
    const page = app.$('video-grid').children[1];
    const original = [...page.children];
    page.rect = { width: 600, height: 600, top: -3000, bottom: -2400 };
    app.events.get('scroll')!();
    await app.settle();
    expect(page.childElementCount).toBe(0);
    expect(page.style.minHeight).toBe('600px');
    page.rect = { width: 600, height: 600, top: 0, bottom: 600 };
    app.events.get('scroll')!();
    await app.settle();
    expect(page.children).toEqual(original);
    expect(page.style.minHeight).toBe('');
    expect(app.fetch).toHaveBeenCalledTimes(2);
  });
});
