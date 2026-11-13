import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/views/watch.ejs', 'utf8');
const classSource = source.slice(source.indexOf('      class MoarTubeWatch {'), source.indexOf('      const moarTubeWatch = new MoarTubeWatch();'))
  .replace(/<%[-=][\s\S]*?%>/g, 'null');

function setup() {
  const label = { hidden: true, textContent: '' };
  const button = { disabled: false };
  const $ = selector => {
    assert.equal(selector, '#update-comments-button');
    return { prop: (name, value) => { button[name] = value; } };
  };
  $.Deferred = () => {
    const done = [], fail = [];
    let settled, args;
    const result = {
      done(callback) { done.push(callback); if (settled === 'done') callback(...args); return result; },
      fail(callback) { fail.push(callback); if (settled === 'fail') callback(...args); return result; },
    };
    const settle = (state, callbacks, values) => {
      if (settled) return;
      settled = state; args = values;
      for (const callback of callbacks) callback(...args);
    };
    return {
      promise: () => result,
      resolve: (...values) => settle('done', done, values),
      reject: (...values) => settle('fail', fail, values),
    };
  };
  let now = 100_000;
  const Watch = vm.runInNewContext(classSource + '; MoarTubeWatch;', {
    document: { getElementById: () => label }, Date: { now: () => now },
    setTimeout, clearTimeout, $,
  });
  const watch = Object.create(Watch.prototype);
  const store = { epoch: 'epoch', version: 1, generation: 0, ready: Promise.resolve(), serial: Promise.resolve(),
    checkOwnership: async () => {}, remove: async () => {} };
  const calls = [], cached = [];
  let pending = 1;
  Object.assign(watch, {
    VIDEO_ID: 'video', COMMENT_SEEN_ID: 5, COMMENT_SEEN_EPOCH: 'epoch', COMMENT_NEW_COUNT: 0,
    COMMENT_STATE_CHECKED_AT: 0, COMMENT_CDN_STATE: { epoch: 'epoch', version: 1 }, COMMENT_ELEMENT_CACHE: {},
    commentStore: () => store,
    cacheComments: async rows => cached.push(...rows),
    commentRequest: async (url, query) => {
      calls.push({ url, query });
      if (url.endsWith('/state')) return { epoch: 'epoch', version: 2, newCommentCount: pending, latestCommentId: 5 + pending, totalCount: 5 + pending };
      if (url.endsWith('/cache')) return { epoch: 'epoch', version: 2, comments: [{ commentId: 6 }], deletedIds: [], hasMore: false, totalCount: 6 };
      throw new Error('Unexpected comment body request');
    },
  });
  return { watch, store, label, button, calls, cached,
    advance: () => { now += 31_000; },
    setPending: value => { pending = value; },
  };
}

for (const [count, expected] of [[0, ''], [1, '1 new comment'], [2, '2 new comments'], [100, '100 new comments']]) {
  test(`renders ${count} pending comments with the correct label visibility and grammar`, () => {
    const page = setup();
    page.watch.COMMENT_NEW_COUNT = count;
    page.watch.renderNewCommentIndicator();
    assert.equal(page.label.hidden, count === 0);
    assert.equal(page.label.textContent, expected);
  });
}

test('background checks only request metadata, leave cached bodies unchanged, and respect the poll deadline', async () => {
  const page = setup();
  await page.watch.ensureCommentFreshness();
  await page.watch.ensureCommentFreshness();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].url, '/videos/video/comments/state');
  assert.equal(page.calls[0].query.afterId, 5);
  assert.equal(page.store.version, 1);
  assert.equal(page.watch.COMMENT_CDN_STATE.version, 1);
  assert.equal(page.cached.length, 0);
  assert.equal(page.label.textContent, '1 new comment');
  page.setPending(0);
  page.advance();
  await page.watch.ensureCommentFreshness();
  assert.equal(page.label.hidden, true);
});

function startRefresh(page, count = 1) {
  let resolve, reject, requests = 0;
  const response = new Promise((success, failure) => { resolve = success; reject = failure; });
  page.watch.syncCommentCache = () => { requests++; return response; };
  page.watch.getCachedCommentPage = async () => ({
    comments: Array.from({ length: count }, (_, index) => ({ commentId: 6 + index })),
    hasMore: false,
  });
  page.watch.loadComments = comments => {
    page.watch.acknowledgeCommentUpdates(comments);
    return comments.length;
  };
  page.watch.updateCommentTotal = () => {};
  const task = page.watch.updateComments();
  return { task, resolve: () => resolve({ totalCount: 5 + count }), reject, requests: () => requests };
}

for (const count of [0, 1, 3]) {
  test(`refresh uses the shared label for progress and ${count} retrieved comments`, async () => {
    const page = setup();
    const refresh = startRefresh(page, count);
    assert.equal(page.label.textContent, '...retrieving comments...');
    assert.equal(page.label.hidden, false);
    assert.equal(page.button.disabled, true);
    await page.watch.updateComments();
    assert.equal(refresh.requests(), 1);
    await page.watch.ensureCommentFreshness();
    assert.equal(page.label.textContent, '...retrieving comments...');
    refresh.resolve();
    await refresh.task;
    assert.equal(page.label.textContent, `${count} comment${count === 1 ? '' : 's'} retrieved`);
    assert.equal(page.label.hidden, false);
    assert.equal(page.button.disabled, false);
    assert.equal(page.watch.COMMENT_REFRESH_REQUEST, null);
  });
}

for (const failure of ['network', 'server', 'render']) {
  test(`${failure} errors use the shared label and re-enable Refresh`, async () => {
    const page = setup();
    const refresh = startRefresh(page);
    if (failure === 'network') refresh.reject(new Error('Network failed'));
    else {
      if (failure === 'server') page.watch.getCachedCommentPage = async () => ({ isError: true });
      else page.watch.loadComments = () => { throw new Error('Rendering failed'); };
      refresh.resolve();
    }
    await refresh.task;
    assert.equal(page.label.textContent, 'error retrieving comments');
    assert.equal(page.label.hidden, false);
    assert.equal(page.button.disabled, false);
    assert.equal(page.watch.COMMENT_SYNC_LOADING, false);
    // A failed refresh can be retried immediately.
    const retry = startRefresh(page, 0);
    retry.resolve();
    await retry.task;
    assert.equal(page.label.textContent, '0 comments retrieved');
  });
}

test('cancelling a refresh re-enables the button without reporting a retrieval error', async () => {
  const page = setup();
  const refresh = startRefresh(page);
  page.watch.COMMENT_REFRESH_REQUEST.abort();
  await refresh.task;
  assert.equal(page.button.disabled, false);
  assert.notEqual(page.label.textContent, '...retrieving comments...');
  assert.notEqual(page.label.textContent, 'error retrieving comments');
  refresh.resolve();
});

test('later state polls reuse the label after the retrieval result', async () => {
  const page = setup();
  const refresh = startRefresh(page, 0);
  refresh.resolve();
  await refresh.task;
  assert.equal(page.label.textContent, '0 comments retrieved');
  await page.watch.ensureCommentFreshness();
  assert.equal(page.label.textContent, '1 new comment');
});

test('a state poll overlapping completion cannot replace the retrieval result', async () => {
  const page = setup();
  let releaseState;
  page.watch.readCommentState = () => new Promise(resolve => { releaseState = resolve; });
  const poll = page.watch.ensureCommentFreshness();
  const refresh = startRefresh(page, 0);
  refresh.resolve();
  await refresh.task;
  releaseState({ afterId: 5, epoch: 'epoch', newCommentCount: 0 });
  await poll;
  assert.equal(page.label.textContent, '0 comments retrieved');
});

test('explicit refresh fetches changed bodies and accepting them hides the label', async () => {
  const page = setup();
  await page.watch.ensureCommentFreshness();
  assert.equal(page.cached.length, 0);
  await page.watch.syncCommentCache();
  assert.equal(page.calls[1].query.fresh, '1');
  assert.equal(page.calls[2].url, '/videos/video/comments/cache');
  assert.equal(page.cached.length, 1);
  assert.equal(page.store.version, 2);
  page.watch.acknowledgeCommentUpdates(page.cached);
  assert.equal(page.watch.COMMENT_SEEN_ID, 6);
  assert.equal(page.label.hidden, true);
});

test('partial refreshes keep the remaining count visible and duplicate or older rows do not decrement it', async () => {
  const page = setup();
  page.setPending(3);
  await page.watch.ensureCommentFreshness();
  page.watch.acknowledgeCommentUpdates([{ commentId: 6 }, { commentId: 6 }, { commentId: 1 }]);
  assert.equal(page.label.textContent, '2 new comments');
  page.watch.acknowledgeCommentUpdates([{ commentId: 6 }, { commentId: 7 }]);
  assert.equal(page.label.textContent, '1 new comment');
  page.watch.acknowledgeCommentUpdates([{ commentId: 8 }]);
  assert.equal(page.label.hidden, true);
});

test('a metadata response for an obsolete cursor cannot restore a cleared notification', async () => {
  const page = setup();
  page.watch.readCommentState = async () => {
    page.watch.COMMENT_SEEN_ID = 6;
    return { afterId: 5, epoch: 'epoch', newCommentCount: 1 };
  };
  await page.watch.ensureCommentFreshness();
  assert.equal(page.label.hidden, true);
  assert.equal(page.watch.COMMENT_STATE_CHECKED_AT, 0);
});

test('a database epoch change reports the available comments without downloading them', async () => {
  const page = setup();
  page.watch.readCommentState = async () => ({ afterId: 5, epoch: 'replacement', newCommentCount: 0, totalCount: 3 });
  await page.watch.ensureCommentFreshness();
  assert.equal(page.label.textContent, '3 new comments');
  assert.equal(page.cached.length, 0);
});
