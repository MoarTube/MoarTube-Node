import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ejs from 'ejs';

const template = readFileSync('public/views/node.ejs', 'utf8');
const source = template.slice(
  template.indexOf('class MoarTubeNode'),
  template.indexOf('      if (window.ethereum != null)')
);

class Element {
  children: Element[] = [];
  selectors = new Map<string, Element>();
  style = {};
  dataset = {};
  classList = { add: vi.fn() };
  textContent = '';
  hidden = false;
  onclick?: () => void;
  append(...elements: Element[]) {
    this.children.push(...elements);
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute = vi.fn();
  getBoundingClientRect() {
    return { top: 100, bottom: 120 };
  }
  set innerHTML(_html: string) {
    for (const selector of [
      'a',
      'img',
      '.card-title',
      '.video-views',
      '.video-streaming-timestamp',
      '.position-relative',
    ]) {
      this.selectors.set(selector, new Element());
    }
  }
  querySelector(selector: string) {
    return this.selectors.get(selector)!;
  }
}

function harness() {
  const elements = new Map(
    [
      'videos-container',
      'catalog-sentinel',
      'videos-scroller-loading-spinner',
      'catalog-status',
      'tag-buttons',
    ].map((id) => [id, new Element()])
  );
  const frames: (() => void)[] = [];
  const requests: any[] = [];
  const observed: any[] = [];
  const events: Record<string, (event?: unknown) => void> = {};
  const ajax = vi.fn((options) => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const request: any = {
      options,
      abort: vi.fn(),
      done(fn: (...args: any[]) => void) {
        handlers.done = fn;
        return request;
      },
      fail(fn: (...args: any[]) => void) {
        handlers.fail = fn;
        return request;
      },
      always(fn: (...args: any[]) => void) {
        handlers.always = fn;
        return request;
      },
      resolve(data: unknown) {
        handlers.done(data);
        handlers.always();
      },
      reject() {
        handlers.fail({}, 'error');
        handlers.always();
      },
    };
    requests.push(request);
    return request;
  });
  const node = runInNewContext(source + '; new MoarTubeNode()', {
    INCOMING_PARAMETERS: {},
    $: { ajax },
    document: {
      getElementById: (id: string) => elements.get(id),
      createElement: () => new Element(),
    },
    window: {
      innerHeight: 800,
      addEventListener: (name: string, callback: () => void) => {
        events[name] = callback;
      },
    },
    IntersectionObserver: class {
      constructor(callback: (entries: unknown[]) => void) {
        observed.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
    URLSearchParams,
    setTimeout,
    clearTimeout,
  });
  node.CURRENT_SEARCH_TERM = '';
  node.CURRENT_SORT_TERM = 'latest';
  node.CURRENT_TAG_TERM = '';
  node.EXTERNAL_VIDEOS_BASE_URL = '';
  node.applyTimestampUpdateTrackerToVideo = vi.fn();
  node.clearTimestampUpdateTracker = vi.fn();
  node.setupInfiniteScroll();
  return { node, elements, requests, observed, frames, events, ajax };
}

const video = (id: string) => ({
  video_id: id,
  title: '<sample>',
  views: 1,
  creation_timestamp: 0,
  length_seconds: 20,
});
const page = (nextOffset: number, hasMore = true) => ({
  searchResults: [video(String(nextOffset))],
  tagGroups: [],
  nextOffset,
  hasMore,
});

afterEach(() => vi.useRealTimers());

describe('videos page infinite scrolling', () => {
  it('compiles the template and renders only the returned tag groups, including shared videos', () => {
    expect(() => ejs.compile(template)).not.toThrow();
    const { node, elements } = harness();
    node.acceptCatalogPage({
      tagGroups: [
        { tag: 'music & more', videos: [video('shared')] },
        { tag: 'other', videos: [video('shared')] },
      ],
      nextOffset: 2,
      hasMore: false,
    });
    expect([...node.catalogGroups.keys()]).toEqual(['music & more', 'other']);
    expect(elements.get('videos-container')!.children).toHaveLength(2);
    const card = node.catalogGroups.get('music & more').inner.children[0];
    expect(card.querySelector('.card-title').textContent).toBe('<sample>');
    node.loadVideos([video('shared')], 'music & more');
    expect(node.catalogGroups.get('music & more').inner.children).toHaveLength(1);
  });

  it('appends selected-tag results, preserves filters, and prevents concurrent loads', () => {
    const { node, requests, observed } = harness();
    node.getVideos('song', 'oldest', 'music');
    observed[0]([{ isIntersecting: true }]);
    expect(requests).toHaveLength(1);
    expect(requests[0].options.data).toEqual({
      searchTerm: 'song',
      sortTerm: 'oldest',
      tagTerm: 'music',
      offset: 0,
    });
    requests[0].resolve(page(12));
    observed[0]([{ isIntersecting: true }]);
    expect(requests[1].options.data.offset).toBe(12);
    requests[1].resolve(page(24, false));
    expect(node.catalogGroups.get('music').inner.children).toHaveLength(2);
    observed[0]([{ isIntersecting: true }]);
    expect(requests).toHaveLength(2);
  });

  it('discards stale responses after a search or tag change, including during debounce', () => {
    vi.useFakeTimers();
    const { node, requests, elements } = harness();
    node.getVideos('old', 'latest', 'music');
    node.updateAddressBar = vi.fn();
    node.searchInputEntered({ value: 'new' });
    expect(elements.get('videos-scroller-loading-spinner')!.hidden).toBe(false);
    expect(requests[0].abort).toHaveBeenCalled();
    requests[0].resolve(page(12));
    expect(node.catalogGroups.size).toBe(0);
    node.loadMoreVideos();
    expect(requests).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(requests[1].options.data.searchTerm).toBe('new');
    node.getVideos('new', 'popular', 'other');
    requests[1].resolve(page(12));
    expect(node.catalogLoading).toBe(true);
    expect(node.catalogGroups.size).toBe(0);
    requests[2].resolve(page(12, false));
    expect([...node.catalogGroups.keys()]).toEqual(['other']);
  });

  it('reconnects scrolling when returning through the browser back cache', () => {
    const { node, events, requests } = harness();
    node.getVideos('song', 'latest', 'music');
    events.pagehide();
    expect(requests[0].abort).toHaveBeenCalled();
    expect(node.catalogObserver.disconnect).toHaveBeenCalled();
    events.pageshow({ persisted: true });
    expect(node.catalogObserver.observe).toHaveBeenCalledTimes(2);
    expect(requests[1].options.data).toEqual({
      searchTerm: 'song',
      sortTerm: 'latest',
      tagTerm: 'music',
      offset: 0,
    });
  });

  it('automatically retries at the same offset indefinitely and fills a short viewport', () => {
    vi.useFakeTimers();
    const { node, requests, frames, elements } = harness();
    node.getVideos('', 'popular', 'music');
    requests[0].resolve(page(12));
    frames.shift()!();
    expect(requests[1].options.data.offset).toBe(12);
    requests[1].reject();
    expect(elements.get('catalog-status')!.textContent).toBe('Loading...');
    expect(elements.get('videos-scroller-loading-spinner')!.hidden).toBe(false);
    node.loadMoreVideos();
    expect(requests).toHaveLength(2);
    for (const delay of [1000, 2000, 4000, 8000, 10000, 10000]) {
      vi.advanceTimersByTime(delay);
      expect(requests.at(-1).options.data.offset).toBe(12);
      requests.at(-1).reject();
    }
    vi.advanceTimersByTime(10000);
    requests.at(-1).resolve(page(24, false));
    expect(elements.get('catalog-status')!.textContent).toBe('');
    expect(elements.get('videos-scroller-loading-spinner')!.hidden).toBe(true);
    const count = requests.length;
    vi.advanceTimersByTime(60000);
    expect(requests).toHaveLength(count);
  });
  it('cancels a scheduled automatic retry when the filters change', () => {
    vi.useFakeTimers();
    const { node, requests } = harness();
    node.getVideos('', 'latest', 'music');
    requests[0].reject();
    node.getVideos('city', 'oldest', 'other');
    expect(requests).toHaveLength(2);
    expect(requests[1].options.data).toEqual({
      searchTerm: 'city',
      sortTerm: 'oldest',
      tagTerm: 'other',
      offset: 0,
    });
    vi.advanceTimersByTime(10000);
    expect(requests).toHaveLength(2);
  });
});
