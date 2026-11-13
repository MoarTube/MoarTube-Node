import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLiveOffset, initializeLiveTimeline, livePlaybackTime, liveSeekTime, liveTimelineState } from '../../client/videojs-10.2.0-live.js';

const live = overrides => ({
  seekable: [[0, 120]], buffered: [[90, 120]], currentTime: 114,
  liveEdgeStart: 114, targetLiveWindow: Infinity, paused: false, seeking: false,
  ...overrides,
});

test('pins live playback through segment arrivals without changing playback time', () => {
  for (let seconds = 0; seconds < 10; seconds++) {
    const state = live({ currentTime: 114 + seconds, seekable: [[0, 120 + Math.floor(seconds / 2) * 2]], liveEdgeStart: 114 + Math.floor(seconds / 2) * 2 });
    const view = liveTimelineState(state);
    assert.equal(view.value, view.end);
    assert.equal(state.currentTime, 114 + seconds);
  }
});

test('paused, seeking, and rewound playback show their actual positions', () => {
  for (const state of [live({ paused: true }), live({ seeking: true }), live({ currentTime: 60 })]) {
    const view = liveTimelineState(state);
    assert.equal(view.atLiveEdge, false);
    assert.equal(view.value, state.currentTime);
  }
  assert.equal(liveTimelineState(live(), true).value, 114);
});

test('uses sliding seekable bounds, clamps expired positions, and maps buffering to that window', () => {
  const view = liveTimelineState(live({ seekable: [[100, 160]], currentTime: 90, buffered: [[100, 130]], paused: true }));
  assert.equal(view.start, 100);
  assert.equal(view.end, 160);
  assert.equal(view.value, 100);
  assert.equal(view.bufferPercent, 50);
});

test('waits for a finite seekable window and known live state before pinning', () => {
  for (const seekable of [[], [[0, Infinity]], [[10, 10]]]) {
    const view = liveTimelineState(live({ seekable }));
    assert.equal(view.disabled, true);
    assert.equal(view.atLiveEdge, false);
  }
  assert.equal(liveTimelineState(live({ targetLiveWindow: NaN })).atLiveEdge, false);
  assert.equal(liveTimelineState(live({ liveEdgeStart: NaN })).atLiveEdge, true);
});

test('clamps seeks to history and skips gaps between available ranges', () => {
  const ranges = [[100, 120], [130, 160]];
  for (const [requested, expected] of [[0, 100], [110, 110], [125, 130], [190, 160]]) {
    assert.equal(liveSeekTime(requested, ranges), expected);
  }
  assert.equal(liveSeekTime(10, []), null);
  assert.equal(liveSeekTime(20, [[0, 0], [10, Infinity]]), null);
  assert.equal(liveSeekTime(NaN, ranges), null);
});

test('formats previews as time behind live, including hours', () => {
  assert.equal(formatLiveOffset(120, 120), 'LIVE');
  assert.equal(formatLiveOffset(90, 120), '-0:30');
  assert.equal(formatLiveOffset(0, 3661), '-1:01:01');
});

test('live seeks use the engine safety delay and a bounded fallback when it is unavailable', () => {
  assert.equal(livePlaybackTime(live()), 114);
  assert.equal(livePlaybackTime(live({ liveEdgeStart: NaN })), 110);
  assert.equal(livePlaybackTime(live({ liveEdgeStart: 120 })), 110);
  assert.equal(livePlaybackTime(live({ seekable: [[118, 120]], liveEdgeStart: NaN })), 118);
  assert.equal(livePlaybackTime(live({ seekable: [] })), null);
});

function element() {
  const node = new EventTarget();
  node.attributes = new Map();
  node.style = {
    setProperty: (key, value) => node.attributes.set(key, value),
    removeProperty: key => node.attributes.delete(key),
  };
  node.setAttribute = (key, value) => node.attributes.set(key, value);
  node.toggleAttribute = (key, value) => value ? node.attributes.set(key, '') : node.attributes.delete(key);
  return node;
}

function setup(overrides) {
  const input = element(), preview = element(), timeline = element(), liveButton = element();
  timeline.querySelector = selector => selector === 'input' ? input : preview;
  timeline.getBoundingClientRect = () => ({ left: 10, width: 200 });
  const controller = new AbortController();
  const listeners = new Set(), seeks = [];
  let plays = 0, locks = 0;
  const store = {
    state: live(overrides),
    subscribe(callback, { signal }) {
      listeners.add(callback);
      signal.addEventListener('abort', () => listeners.delete(callback), { once: true });
    },
    seek(time) { seeks.push(time); store.state = { ...store.state, currentTime: time }; return Promise.resolve(time); },
    requestControlsLock() { locks++; return () => locks--; },
  };
  function update(changes) {
    store.state = { ...store.state, ...changes };
    for (const listener of listeners) listener();
  }
  initializeLiveTimeline({ timeline, liveButton, store, signal: controller.signal, play: () => { plays++; update({ paused: false }); } });
  function event(node, type, props = {}) {
    const dispatched = new Event(type, { cancelable: true });
    Object.assign(dispatched, props);
    node.dispatchEvent(dispatched);
    return dispatched;
  }
  return { input, preview, timeline, liveButton, store, seeks, update, event, controller,
    get plays() { return plays; }, get locks() { return locks; }, get subscriptions() { return listeners.size; } };
}

test('live updates only move the display; pausing releases the visual pin', () => {
  const page = setup();
  assert.equal(Number(page.input.value), 120);
  assert.equal(page.liveButton.attributes.has('data-live-edge'), true);
  page.update({ currentTime: 115, seekable: [[0, 122]], liveEdgeStart: 116 });
  assert.equal(Number(page.input.value), 122);
  assert.deepEqual(page.seeks, []);
  page.update({ paused: true });
  assert.equal(Number(page.input.value), 115);
  assert.equal(page.liveButton.disabled, false);
  assert.equal(page.liveButton.attributes.has('data-live-edge'), false);
});

test('small intentional rewinds stay unpinned until playback catches up', () => {
  const page = setup();
  page.input.value = 112;
  page.event(page.input, 'input');
  page.update({ currentTime: 113 });
  assert.equal(Number(page.input.value), 113);
  page.update({ currentTime: 114 });
  assert.equal(Number(page.input.value), 120);
});

test('dragging retains the selected value and locks controls until release or cancellation', () => {
  const page = setup();
  page.event(page.input, 'pointerdown');
  page.input.value = 60;
  page.event(page.input, 'input');
  page.update({ currentTime: 61, seekable: [[0, 122]] });
  assert.equal(Number(page.input.value), 60);
  assert.equal(page.locks, 1);
  page.event(page.input, 'pointercancel');
  assert.equal(Number(page.input.value), 61);
  assert.equal(page.locks, 0);
  assert.deepEqual(page.seeks, [60]);
});

test('keyboard rewind starts from actual playback, and Home/End respect the current window', () => {
  const page = setup({ seekable: [[100, 160]], currentTime: 154, liveEdgeStart: 154 });
  const key = page.event(page.input, 'keydown', { key: 'ArrowLeft' });
  assert.equal(key.defaultPrevented, true);
  assert.deepEqual(page.seeks, [149]);
  page.event(page.input, 'keydown', { key: 'Home' });
  page.event(page.input, 'keydown', { key: 'End' });
  assert.deepEqual(page.seeks, [149, 100, 154]);
});

test('LIVE seeks to the latest safe live position and resumes paused playback', () => {
  const page = setup({ paused: true, currentTime: 60 });
  page.update({ seekable: [[0, 124]], liveEdgeStart: 118 });
  page.event(page.liveButton, 'click');
  assert.deepEqual(page.seeks, [118]);
  assert.equal(page.plays, 1);
  assert.equal(page.liveButton.attributes.has('data-live-edge'), true);
  assert.equal(Number(page.input.value), 124);
});

test('scrubbing to the end and forward keyboard seeks preserve the engine safety delay', () => {
  const page = setup({ currentTime: 110 });
  page.input.value = 120;
  page.event(page.input, 'input');
  assert.deepEqual(page.seeks, [114]);
  assert.equal(Number(page.input.value), 120);
  page.event(page.input, 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(page.seeks, [114, 114]);
  assert.equal(page.liveButton.attributes.has('data-live-edge'), true);
});

test('metadata gaps and source switches disable seeking until history becomes available again', () => {
  const page = setup();
  page.update({ seekable: [], currentTime: 0 });
  assert.equal(page.input.disabled, true);
  page.event(page.liveButton, 'click');
  assert.deepEqual(page.seeks, []);
  page.update({ seekable: [[100, 160]], currentTime: 154, liveEdgeStart: 154 });
  assert.equal(page.input.disabled, false);
  assert.equal(Number(page.input.min), 100);
  assert.equal(Number(page.input.value), 160);
});

test('quality switches preserve intentional rewinds close to the live edge', () => {
  const page = setup();
  page.input.value = 112;
  page.event(page.input, 'input');
  page.update({ seekable: [], currentTime: 0, liveEdgeStart: NaN });
  page.update({ seekable: [[0, 120]], currentTime: 112, liveEdgeStart: 114 });
  assert.equal(Number(page.input.value), 112);
  assert.equal(page.liveButton.disabled, false);
});

test('pointer previews show offsets and teardown releases subscriptions and control locks', () => {
  const page = setup();
  page.event(page.timeline, 'pointermove', { clientX: 110 });
  assert.equal(page.preview.textContent, '-1:00');
  page.event(page.timeline, 'pointerleave');
  assert.equal(page.timeline.attributes.has('--media-slider-pointer'), false);
  page.event(page.input, 'pointerdown');
  page.controller.abort();
  assert.equal(page.locks, 0);
  assert.equal(page.subscriptions, 0);
  page.event(page.liveButton, 'click');
  assert.deepEqual(page.seeks, []);
});
