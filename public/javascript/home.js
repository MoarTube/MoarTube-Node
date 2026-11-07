/* The homepage uses revisioned pages, not the browser HTTP cache, for repeat navigation. */
(() => {
  'use strict';
  const model = JSON.parse(document.getElementById('home-model').textContent);
  const $ = (id) => document.getElementById(id);
  const mobile = matchMedia('(max-width: 991.98px)');
  const number = (value) => new Intl.NumberFormat().format(Number(value) || 0);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', '#icon-' + name);
    svg.append(use);
    return svg;
  };
  function ago(timestamp) {
    const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
    const units = [
      [31536000, 'year'],
      [2592000, 'month'],
      [86400, 'day'],
      [3600, 'hour'],
      [60, 'min'],
    ];
    for (const [size, label] of units)
      if (seconds >= size) {
        const count = Math.floor(seconds / size);
        return `${count} ${label}${count !== 1 && label !== 'min' ? 's' : ''} ago`;
      }
    return 'Just now';
  }
  const watch = (id) => '/watch?v=' + encodeURIComponent(id);
  function preview(id, className) {
    const link = node('a', className);
    link.href = watch(id);
    link.tabIndex = -1;
    link.setAttribute('aria-hidden', 'true');
    const img = node('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src =
      model.settings.mediaBase +
      '/external/videos/' +
      encodeURIComponent(id) +
      '/images/preview.jpg';
    img.onerror = () => {
      img.onerror = null;
      img.src = '/external/resources/images/preview.jpg';
    };
    link.append(img);
    return link;
  }
  function durationLabel(length, live) {
    const seconds = Math.max(0, Math.floor(Number(length) || 0));
    return live
      ? 'LIVE'
      : (seconds >= 3600
          ? Math.floor(seconds / 3600) +
            ':' +
            String(Math.floor(seconds / 60) % 60).padStart(2, '0')
          : Math.floor(seconds / 60)) +
          ':' +
          String(seconds % 60).padStart(2, '0');
  }
  function videoCard(video) {
    const card = node('article', 'video-card');
    card.dataset.video = video.videoId;
    const image = preview(video.videoId, 'video-preview');
    image.append(node('span', 'duration', durationLabel(video.lengthSeconds, false)));
    if (video.isLive) {
      const badge = node('span', 'stream-badge');
      if (video.isStreaming) badge.append(icon('broadcast'));
      badge.append(node('span', '', video.isStreaming ? 'LIVE' : 'STREAMED'));
      image.append(badge);
    }
    const heading = node('h3', 'video-title');
    const title = node('a', '', video.title);
    title.href = watch(video.videoId);
    heading.append(title);
    const metadata = node(
      'p',
      'video-meta',
      `${number(video.views)} views · ${ago(video.creationTimestamp)}`
    );
    const stats = node('div', 'video-stats');
    for (const [name, value, label] of [
      ['up', video.likes, 'likes'],
      ['down', video.dislikes, 'dislikes'],
      ['comment', video.comments, 'comments'],
    ]) {
      const stat = node('span', 'stat');
      stat.setAttribute('aria-label', `${number(value)} ${label}`);
      stat.append(icon(name), node('span', '', number(value)));
      stats.append(stat);
    }
    card.append(image, heading, metadata, stats);
    return card;
  }
  function readableComment(text) {
    // Existing comment sanitizer entity-encodes plain text. Decode into inert text, never innerHTML in the live DOM.
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    return parsed.body.textContent || '';
  }
  function commentExcerpt(comment) {
    const excerpt = node('p', 'comment-text');
    const lines = readableComment(comment.text).trim().split(/\r?\n/);
    lines.forEach((line, index) => {
      if (index) excerpt.append('\n');
      const text = line.trim();
      const quoted = line.trimStart().startsWith('>') && !/^>>[0-9]/.test(line.trimStart());
      const content = node('span', quoted ? 'comment-quote' : 'comment-line');
      let offset = 0;
      for (const match of text.matchAll(/>{2,}([0-9]+)/g)) {
        const id = Number(match[1]);
        if (!Number.isSafeInteger(id) || id < 1) continue;
        // Retain nesting markers and link only the final pair, as on the watch page.
        const start = match.index + match[0].length - match[1].length - 2;
        content.append(text.slice(offset, start));
        const link = node('a', 'comment-quote-link', '>>' + match[1]);
        link.href = watch(comment.videoId) + '#p' + id;
        link.rel = 'noopener noreferrer';
        content.append(link);
        offset = match.index + match[0].length;
      }
      content.append(text.slice(offset));
      excerpt.append(content);
    });
    return excerpt;
  }
  function commentCard(comment) {
    const card = node('article', 'comment-row');
    card.dataset.comment = comment.commentId;
    const image = preview(comment.videoId, 'comment-preview');
    image.append(
      node('span', 'duration', durationLabel(comment.lengthSeconds, comment.isStreaming))
    );
    const copy = node('div', 'comment-copy');
    const title = node('a', 'comment-title', comment.videoTitle);
    title.href = watch(comment.videoId);
    const author = node('p', 'comment-author', 'Anonymous · ' + ago(comment.timestamp));
    const excerpt = commentExcerpt(comment);
    const link = node(
      'a',
      'comment-link',
      `View ${number(comment.videoCommentCount)} ${Number(comment.videoCommentCount) === 1 ? 'comment' : 'comments'} `
    );
    link.href = watch(comment.videoId) + '#p' + comment.commentId;
    link.append(node('span', 'comment-arrow', '→'));
    copy.append(title, author, excerpt, link);
    card.append(image, copy);
    return card;
  }

  class PageCache {
    memory = new Map();
    pending = new Map();
    db = null;
    constructor() {
      this.ready = new Promise((resolve) => {
        let request;
        try {
          request = indexedDB.open('moartube-home-v1', 1);
        } catch {
          resolve();
          return;
        }
        request.onupgradeneeded = () =>
          request.result.createObjectStore('pages', { keyPath: 'key' });
        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => {
            this.db.close();
            this.db = null;
          };
          resolve();
        };
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    }
    async get(key) {
      await this.ready;
      let entry = this.memory.get(key);
      if (!entry && this.db)
        try {
          entry = await new Promise((resolve) => {
            const request = this.db.transaction('pages').objectStore('pages').get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          });
        } catch {
          this.disable();
        }
      if (entry && entry.expires > Date.now()) {
        this.remember(key, entry);
        return entry.data;
      }
      return null;
    }
    remember(key, entry) {
      this.memory.delete(key);
      this.memory.set(key, entry);
      while (this.memory.size > 80) this.memory.delete(this.memory.keys().next().value);
    }
    disable() {
      this.db?.close();
      this.db = null;
    }
    async put(key, data) {
      const entry = { key, data, expires: Date.now() + 3600000 };
      this.remember(key, entry);
      await this.ready;
      if (this.db)
        try {
          await new Promise((resolve, reject) => {
            const tx = this.db.transaction('pages', 'readwrite');
            const store = tx.objectStore('pages');
            store.put(entry);
            const request = store.getAll();
            request.onsuccess = () => {
              const rows = request.result.sort((a, b) => b.expires - a.expires);
              rows.forEach((row, index) => {
                if (index >= 120 || row.expires <= Date.now()) store.delete(row.key);
              });
            };
            tx.oncomplete = resolve;
            tx.onabort = reject;
            tx.onerror = reject;
          });
        } catch {
          this.disable();
        }
    }
    async read(path, params, cached = true) {
      const search = new URLSearchParams(
        Object.entries(params)
          .filter(([, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
      );
      const key = path + '?' + search;
      if (cached) {
        const hit = await this.get(key);
        if (hit) return hit;
      }
      if (this.pending.has(key)) return this.pending.get(key);
      const request = (async () => {
        const response = await fetch(key, {
          signal: AbortSignal.timeout(15000),
          cache: 'no-cache',
          credentials: 'same-origin',
        });
        const data = await response.json();
        if (!response.ok)
          throw Object.assign(new Error(data.message || 'Unable to load. Please retry.'), {
            reset: data.reset,
          });
        if (cached && response.headers.get('Cache-Control')?.includes('s-maxage=3600'))
          await this.put(key, data);
        return data;
      })().finally(() => this.pending.delete(key));
      this.pending.set(key, request);
      return request;
    }
  }
  const cache = new PageCache();
  let initialized = false;
  let state = model.state,
    query = { ...model.query },
    videoGeneration = 0,
    tagGeneration = 0;
  let videosLoading = false,
    videoCursor = 0,
    videoSnapshot,
    videoRevision,
    videosMore = true;
  let commentsLoading = false,
    commentGeneration = 0,
    commentIndex = 0,
    commentPages = [],
    commentRevision,
    commentSnapshot;
  let tagCursor = 0,
    tagRevision,
    tagLoading = false,
    tagRows = [],
    tagMore = false;
  let commentsSearchOpen = Boolean(query.commentSearch);
  const scrollPositions = { videos: 0, about: 0, community: 0 };
  const read = (kind, params = {}, cached = true) => cache.read('/home/' + kind, params, cached);
  function params(revision, extra = {}) {
    return { epoch: state.epoch, revision, ...extra };
  }
  const retries = new Map();
  function clearRetry(key) {
    clearTimeout(retries.get(key)?.timer);
    retries.delete(key);
  }
  function retryPending(key) {
    return retries.get(key)?.timer != null;
  }
  function retryLater(key, retry, current = () => true) {
    const entry = retries.get(key) || { timer: null };
    if (entry.timer != null) return;
    entry.timer = setTimeout(async () => {
      entry.timer = null;
      if (!current()) {
        clearRetry(key);
        return;
      }
      try {
        await retry();
      } catch {
        if (current()) retryLater(key, retry, current);
        else if (retries.get(key) === entry && entry.timer == null) clearRetry(key);
      }
    }, 5000);
    retries.set(key, entry);
  }
  function failure(id, error, retry, current) {
    $(id).replaceChildren();
    retryLater(id, retry, current);
  }
  function url(mode = 'push') {
    const values = {};
    for (const name of ['searchTerm', 'tagTerm', 'tagSearch', 'commentSearch'])
      if (query[name]) values[name] = query[name];
    if (query.sortTerm !== 'hot') values.sortTerm = query.sortTerm;
    if (query.view !== 'videos') values.view = query.view;
    const search = new URLSearchParams(
      Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
    ).toString();
    history[mode === 'replace' ? 'replaceState' : 'pushState'](
      null,
      '',
      '/' + (search ? '?' + search : '')
    );
  }
  function controls() {
    $('search-input').value = query.searchTerm;
    $('comment-search-input').value = query.commentSearch || '';
    $('comment-search').hidden = !commentsSearchOpen;
    $('comments-search-toggle').setAttribute('aria-expanded', String(commentsSearchOpen));
    $('sort-select').value = query.sortTerm;
    $('tag-search').value = query.tagSearch;
    $('selected-tag').textContent = query.tagTerm || 'All tags';
    $('search-toggle').setAttribute('aria-expanded', String(document.body.classList.contains('search-open')));
    document
      .querySelectorAll('[data-sort]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', button.dataset.sort === query.sortTerm)
      );
    document.querySelectorAll('.mobile-tabs button').forEach((button) => {
      button.setAttribute('aria-selected', button.dataset.view === query.view);
      button.tabIndex = button.dataset.view === query.view ? 0 : -1;
    });
    document.body.dataset.view = query.view;
  }

  // Keep only nearby card DOM mounted; page placeholders retain scroll geometry.
  const virtualPages = new Set();
  let virtualScheduled = false;
  function virtualize() {
    virtualScheduled = false;
    for (const page of virtualPages) {
      if (!page.element.isConnected) {
        clearRetry(page.element);
        virtualPages.delete(page);
        continue;
      }
      const rect = page.element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const nearby = rect.bottom > -1800 && rect.top < innerHeight + 1800;
      if (
        !nearby &&
        page.element.childElementCount &&
        !page.element.contains(document.activeElement)
      ) {
        page.element.style.minHeight = rect.height + 'px';
        page.element.replaceChildren();
      } else if (nearby && !page.element.childElementCount && !page.loading && !retryPending(page.element)) {
        page.loading = true;
        page
          .load()
          .then((data) => {
            if (page.element.isConnected) {
              clearRetry(page.element);
              page.element.replaceChildren(...data.map(page.render));
              page.element.style.minHeight = '';
            }
          })
          .catch((error) => {
            if (!page.element.isConnected) return;
            retryLater(page.element, () => {
              if (error.reset) {
                return page.render === videoCard ? refreshVideos() : refreshComments();
              } else {
                scheduleVirtual();
              }
            }, () => page.element.isConnected);
          })
          .finally(() => {
            page.loading = false;
          });
      }
    }
  }
  function scheduleVirtual() {
    if (!virtualScheduled) {
      virtualScheduled = true;
      requestAnimationFrame(virtualize);
    }
  }
  addEventListener('scroll', scheduleVirtual, { passive: true });
  function mountPage(container, items, render, load) {
    const element = node('div', container.id === 'video-grid' ? 'video-page' : 'comment-batch');
    element.append(...items.map(render));
    container.append(element);
    virtualPages.add({ element, render, load, loading: false });
    scheduleVirtual();
    return element;
  }
  async function loadVideos() {
    if (!initialized || videosLoading || retryPending('video-status') || !videosMore || (mobile.matches && query.view !== 'videos'))
      return;
    const generation = videoGeneration;
    videosLoading = true;
    $('video-status').textContent = 'Loading videos…';
    const input = params(videoRevision, {
      searchTerm: query.searchTerm,
      tagTerm: query.tagTerm,
      sortTerm: query.sortTerm,
      cursor: videoCursor,
      snapshot: videoSnapshot,
    });
    try {
      const data = await read('videos', input);
      if (generation !== videoGeneration) return;
      clearRetry('video-status');
      videoSnapshot = data.snapshot;
      videoRevision = data.revision;
      videoCursor = data.nextCursor;
      videosMore = data.hasMore;
      mountPage(
        $('video-grid'),
        data.videos,
        videoCard,
        async () => (await read('videos', input)).videos
      );
      $('video-status').textContent = data.totalCount === 0 ? 'No videos match this search.' : '';
    } catch (error) {
      if (generation === videoGeneration) {
        failure('video-status', error, () => (error.reset ? refreshVideos() : loadVideos()), () => generation === videoGeneration);
      }
    } finally {
      if (generation === videoGeneration) {
        videosLoading = false;
        if (!retryPending('video-status')) maybeLoad();
      }
    }
  }
  async function refreshVideos() {
    if (videosLoading) return;
    const generation = videoGeneration;
    videosLoading = true;
    try {
      await freshState();
      if (generation !== videoGeneration) return;
      resetVideos(true);
      await loadTags();
    } catch (error) {
      if (generation === videoGeneration)
        failure('video-status', error, refreshVideos, () => generation === videoGeneration);
    } finally {
      if (generation === videoGeneration) videosLoading = false;
    }
  }
  function resetVideos(retrying = false) {
    if (!retrying) clearRetry('video-status');
    videoGeneration++;
    videosLoading = false;
    videoCursor = 0;
    videoSnapshot = undefined;
    videoRevision = state.revision;
    videosMore = true;
    $('video-grid').replaceChildren();
    $('video-status').replaceChildren();
    void loadVideos();
  }
  function renderTags() {
    const choose = (tag) => {
      query.tagTerm = tag;
      query.tagSearch = '';
      $('tag-picker').open = false;
      controls();
      url();
      resetVideos();
      void loadTags();
    };
    const button = (label, value, count) => {
      const item = node('button', '', label);
      item.type = 'button';
      item.setAttribute('aria-pressed', query.tagTerm === value);
      item.onclick = () => choose(value);
      if (count !== undefined) item.append(node('span', '', number(count)));
      return item;
    };
    $('tag-options').replaceChildren(button('All tags', ''), ...tagRows.map((row) => button(row.label, row.label, row.count)));
    if (query.tagTerm && !tagRows.some((row) => row.label === query.tagTerm))
      $('tag-options').append(button(query.tagTerm, query.tagTerm));
    $('mobile-more-tags').hidden = !tagMore;
    $('tag-rail').replaceChildren(
      button('All', ''),
      ...tagRows.map((row) => button(row.label, row.label))
    );
    if (query.tagTerm && !tagRows.some((row) => row.label === query.tagTerm))
      $('tag-rail').append(button(query.tagTerm, query.tagTerm));
    $('more-tags').hidden = !tagMore;
  }
  async function loadTags(append = false, retrying = false) {
    if (append && tagLoading) return;
    if (!retrying) clearRetry('tag-status');
    const generation = ++tagGeneration;
    tagLoading = true;
    if (!append) {
      tagCursor = 0;
      tagRevision = state.tagsRevision;
      tagRows = [];
    }
    $('tag-status').textContent = 'Loading tags…';
    try {
      const data = await read(
        'tags',
        params(tagRevision, {
          searchTerm: query.searchTerm,
          tagSearch: query.tagSearch,
          cursor: tagCursor,
        })
      );
      if (generation !== tagGeneration) return;
      clearRetry('tag-status');
      tagRevision = data.revision;
      tagRows.push(...data.tags);
      tagCursor = data.nextCursor;
      tagMore = data.hasMore;
      renderTags();
      $('tag-status').textContent = tagRows.length ? '' : 'No matching tags.';
    } catch (error) {
      if (generation === tagGeneration)
        failure('tag-status', error, async () => {
          if (error.reset) await freshState();
          if (generation === tagGeneration) await loadTags(error.reset ? false : append, true);
        }, () => generation === tagGeneration);
    } finally {
      if (generation === tagGeneration) tagLoading = false;
    }
  }
  function commentButtons() {
    document.querySelector('.comment-pagination').hidden = commentIndex === 0 && !commentPages[0]?.hasMore;
    $('comments-prev').disabled = commentsLoading || commentIndex === 0;
    $('comments-next').disabled = commentsLoading || !commentPages[commentIndex]?.hasMore;
    $('comment-page').textContent = 'Page ' + (commentIndex + 1);
  }
  function renderComments() {
    $('comment-list').replaceChildren();
    const indices = mobile.matches
      ? Array.from({ length: commentIndex + 1 }, (_, index) => index)
      : [commentIndex];
    for (const index of indices) {
      const page = commentPages[index];
      if (!page) continue;
      const batch = mountPage(
        $('comment-list'),
        page.comments,
        commentCard,
        async () => (await read('comments', page.input)).comments
      );
      batch.dataset.page = index;
      if (!page.comments.length) batch.style.minHeight = (page.height || 650) + 'px';
    }
    // Retain bounded data bodies; old batch metadata/cursors remain available through the page cache.
    commentPages.forEach((page, index) => {
      if (Math.abs(index - commentIndex) > 15) page.comments = [];
    });
    commentButtons();
  }
  async function loadComments(index = 0) {
    if (!initialized || commentsLoading || retryPending('comment-status') || (mobile.matches && query.view !== 'community')) return;
    const generation = commentGeneration;
    commentsLoading = true;
    commentButtons();
    $('comment-status').textContent = 'Loading comments…';
    try {
      const previous = commentPages[index - 1];
      const input = params(commentRevision, {
        commentSearch: query.commentSearch || '',
        cursor: previous?.nextCursor ?? 0,
        snapshot: index ? commentSnapshot : undefined,
      });
      const data = await read('comments', input);
      if (generation !== commentGeneration) return;
      clearRetry('comment-status');
      commentRevision = data.revision;
      commentSnapshot = data.snapshot;
      commentPages[index] = { ...data, input };
      commentIndex = index;
      if (mobile.matches && index > 0) {
        const batch = mountPage(
          $('comment-list'),
          data.comments,
          commentCard,
          async () => (await read('comments', input)).comments
        );
        batch.dataset.page = index;
      } else renderComments();
      document.querySelectorAll('.comment-batch').forEach((batch) => {
        const saved = commentPages[Number(batch.dataset.page)];
        if (saved && batch.getBoundingClientRect().height)
          saved.height = batch.getBoundingClientRect().height;
      });
      commentPages.forEach((page, i) => {
        if (Math.abs(i - commentIndex) > 12) page.comments = [];
      });
      $('comment-status').textContent =
        data.totalCount === 0
          ? query.commentSearch
            ? 'No comments match this search.'
            : 'No comments yet.'
          : '';
    } catch (error) {
      if (generation === commentGeneration)
        failure('comment-status', error, () =>
          error.reset ? refreshComments(true) : loadComments(index),
          () => generation === commentGeneration
        );
    } finally {
      if (generation === commentGeneration) {
        commentsLoading = false;
        commentButtons();
        if (!retryPending('comment-status')) maybeLoad();
      }
    }
  }
  async function refreshComments(retrying = false) {
    if (!retrying) clearRetry('comment-status');
    const generation = ++commentGeneration;
    commentsLoading = true;
    commentButtons();
    try {
      await freshState();
      if (generation !== commentGeneration) return;
      commentsLoading = false;
      commentIndex = 0;
      commentPages = [];
      commentSnapshot = undefined;
      $('comment-list').replaceChildren();
      $('comment-status').textContent = 'Loading comments…';
      commentButtons();
      commentRevision = state.commentsRevision;
      await loadComments();
    } catch (error) {
      if (generation === commentGeneration) {
        commentsLoading = false;
        commentButtons();
        failure('comment-status', error, () => refreshComments(true), () => generation === commentGeneration);
      }
    }
  }
  function visible(id) {
    const r = $(id).getBoundingClientRect();
    return r.width > 0 && r.top < innerHeight + 400 && r.bottom >= 0;
  }
  function maybeLoad() {
    requestAnimationFrame(() => {
      if (visible('video-sentinel') && !retryPending('video-status'))
        void loadVideos();
      if (
        mobile.matches &&
        query.view === 'community' &&
        visible('comment-sentinel') &&
        !retryPending('comment-status')
      ) {
        const last = commentPages[commentIndex];
        if (!last || last.hasMore) void loadComments(last ? commentIndex + 1 : 0);
      }
    });
  }
  const observer = new IntersectionObserver(maybeLoad, { rootMargin: '400px' });
  observer.observe($('video-sentinel'));
  observer.observe($('comment-sentinel'));
  function settings(data) {
    model.settings = data;
    for (const key of ['nodeName', 'nodeHeadline', 'nodeAbout'])
      document.querySelectorAll(`[data-setting="${key}"]`).forEach((element) => {
        element.textContent = data[key];
      });
    document.title = data.nodeName + ' · MoarTube';
    $('bulletin').replaceChildren(...data.nodeBulletin.map((item) => node('li', '', item)));
    $('bulletin-empty').hidden = !!data.nodeBulletin.length;
    $('links').replaceChildren(
      ...data.nodeLinks.map((item) => {
        const row = node('div', 'node-link');
        const link = node('a', '', new URL(item.url).hostname);
        link.href = item.url;
        link.rel = 'noopener noreferrer';
        row.append(link, node('span', '', item.description));
        return row;
      })
    );
    $('links-empty').hidden = !!data.nodeLinks.length;
  }
  let stateTask;
  async function freshState(force = true) {
    if (stateTask) return stateTask;
    stateTask = (async () => {
      let incoming = await read('state', force ? { fresh: '1' } : {}, false);
      const saved = await cache.get('home:state');
      const behind = (known) =>
        known &&
        (incoming.epoch !== known.epoch ||
          incoming.catalogRevision < known.catalogRevision ||
          incoming.commentsVersion < known.commentsVersion ||
          incoming.rankingWindow < known.rankingWindow ||
          incoming.settingsRevision !== known.settingsRevision);
      if (!force && (behind(state) || behind(saved)))
        incoming = await read('state', { fresh: '1' }, false);
      await cache.put('home:state', incoming);
      state = incoming;
      return state;
    })().finally(() => {
      stateTask = undefined;
    });
    return stateTask;
  }
  function changeView(view, history = true) {
    scrollPositions[query.view] = scrollY;
    query.view = view;
    controls();
    if (history) url();
    scrollTo(0, scrollPositions[view] || 0);
    if (view === 'community' && !commentPages.length) void loadComments();
    if (view === 'videos' && !$('video-grid').childElementCount) void loadVideos();
    maybeLoad();
    scheduleVirtual();
  }
  document.querySelectorAll('.mobile-tabs button').forEach((button) => {
    button.onclick = () => changeView(button.dataset.view);
  });
  document.querySelector('.mobile-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...document.querySelectorAll('.mobile-tabs button')];
    const current = buttons.indexOf(document.activeElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 2
          : (current + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    buttons[index].focus();
    buttons[index].click();
    event.preventDefault();
  });
  $('tag-options').addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...$('tag-options').querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement);
    buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    event.preventDefault();
  });
  $('tag-picker').addEventListener('toggle', () => {
    if ($('tag-picker').open) $('tag-search').focus();
  });
  $('tag-search').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      $('tag-options').querySelector('button')?.focus();
      event.preventDefault();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('tag-picker').open) {
      $('tag-picker').open = false;
      $('tag-picker').querySelector('summary').focus();
      event.preventDefault();
    }
  });
  document.addEventListener('click', (event) => {
    if (!$('tag-picker').contains(event.target)) $('tag-picker').open = false;
  });
  $('search-toggle').onclick = () => {
    document.body.classList.toggle('search-open');
    controls();
    if (document.body.classList.contains('search-open')) $('search-input').focus();
  };
  let tagTimer;
  $('tag-search').oninput = () => {
    clearTimeout(tagTimer);
    tagTimer = setTimeout(() => {
      query.tagSearch = $('tag-search').value.trim();
      url('replace');
      void loadTags();
    }, 200);
  };
  $('mobile-more-tags').onclick = () => void loadTags(true);
  if (query.searchTerm) document.body.classList.add('search-open');
  let searchTimer;
  function search(mode) {
    query.searchTerm = $('search-input').value.trim();
    controls();
    url(mode);
    resetVideos();
    void loadTags();
  }
  $('search-input').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search('replace'), 250);
  };
  $('video-search').onsubmit = (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    search('push');
  };
  $('more-tags').onclick = () => void loadTags(true);
  function sort(value) {
    query.sortTerm = value;
    controls();
    url();
    resetVideos();
  }
  $('sort-select').onchange = () => sort($('sort-select').value);
  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.onclick = () => sort(button.dataset.sort);
  });
  $('comments-prev').onclick = () => void loadComments(commentIndex - 1);
  $('comments-next').onclick = () => void loadComments(commentIndex + 1);
  let commentSearchTimer;
  function searchComments(mode) {
    query.commentSearch = $('comment-search-input').value.trim();
    url(mode);
    void refreshComments();
  }
  $('comments-search-toggle').onclick = () => {
    commentsSearchOpen = !commentsSearchOpen;
    controls();
    if (commentsSearchOpen) $('comment-search-input').focus();
  };
  $('comment-search-input').oninput = () => {
    clearTimeout(commentSearchTimer);
    commentSearchTimer = setTimeout(() => searchComments('replace'), 250);
  };
  $('comment-search').onsubmit = (event) => {
    event.preventDefault();
    clearTimeout(commentSearchTimer);
    searchComments('push');
  };
  $('comment-search-input').onkeydown = (event) => {
    if (event.key === 'Escape') {
      commentsSearchOpen = false;
      controls();
      $('comments-search-toggle').focus();
      event.preventDefault();
    }
  };

  addEventListener('popstate', () => {
    const values = new URLSearchParams(location.search);
    const view = values.get('view');
    const previousCommentSearch = query.commentSearch || '';
    query = {
      searchTerm: values.get('searchTerm') || '',
      tagTerm: values.get('tagTerm') || '',
      tagSearch: values.get('tagSearch') || '',
      commentSearch: values.get('commentSearch') || '',
      sortTerm: ['hot', 'new', 'discussed', 'viewed'].includes(values.get('sortTerm'))
        ? values.get('sortTerm')
        : 'hot',
      view: ['about', 'community'].includes(view) ? view : 'videos',
    };
    commentsSearchOpen = Boolean(query.commentSearch);
    controls();
    resetVideos();
    void loadTags();
    if (previousCommentSearch !== query.commentSearch) void refreshComments();
    else if (!commentPages.length) void loadComments();
  });
  mobile.addEventListener('change', async () => {
    if (!mobile.matches) {
      const visibleBatch = [...document.querySelectorAll('.comment-batch')].find((batch) => {
        const r = batch.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      });
      if (visibleBatch) commentIndex = Number(visibleBatch.dataset.page);
    }
    const selected = commentPages[commentIndex];
    if (selected && !selected.comments.length)
      try {
        selected.comments = (await read('comments', selected.input)).comments;
      } catch (error) {
        const generation = commentGeneration;
        failure('comment-status', error, () => refreshComments(true), () => generation === commentGeneration);
      }
    renderComments();
    if (!commentPages.length) void loadComments();
    void loadVideos();
    maybeLoad();
    scheduleVirtual();
  });
  addEventListener('resize', scheduleVirtual, { passive: true });
  controls();
  async function initialize() {
    try {
      await freshState(false);
      settings((await read('settings', params(state.settingsRevision))).settings);
      clearRetry('video-status');
      initialized = true;
      videoRevision = state.revision;
      commentRevision = state.commentsRevision;
      resetVideos();
      void loadTags();
      void loadComments();
    } catch (error) {
      failure('video-status', error, initialize);
    }
  }
  void initialize();
})();
