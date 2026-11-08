import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeWatchModes } from '../../client/videojs-10.2.0-modes.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

function element() {
  const node = new EventTarget();
  const classes = new Set();
  node.attributes = {};
  node.classList = {
    contains: value => classes.has(value),
    toggle: (value, active) => active ? classes.add(value) : classes.delete(value),
  };
  node.setAttribute = (key, value) => { node.attributes[key] = value; };
  node.insertBefore = (child, before) => {
    assert.ok(before === null || before.parentElement === node);
    child.parentElement = node;
  };
  return node;
}

function setup({ storage = new Map(), live = true, embedded = false, desktop = true, atomic = false } = {}) {
  const home = element(), wrapper = element(), sibling = element();
  const theaterContainer = element(), main = element(), theater = element();
  home.insertBefore(wrapper, null);
  home.insertBefore(sibling, null);
  wrapper.nextSibling = sibling;
  wrapper.isConnected = true;
  const query = new EventTarget();
  query.matches = desktop;
  let moves = 0;
  if (atomic) {
    home.moveBefore = theaterContainer.moveBefore = function (child, before) {
      this.insertBefore(child, before);
      moves++;
    };
  }
  globalThis.window = {
    matchMedia: () => query,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  globalThis.document = { querySelector: id => id === '#main-container' ? main : theaterContainer };
  const reset = initializeWatchModes({
    wrapper, theater, isStreaming: live, embedded,
    icons: { small: 'small', theater: 'theater', exit: 'exit', fullscreen: 'fullscreen' },
    listen: (target, event, callback) => target.addEventListener(event, callback),
    onMove: move => { moves++; move(); },
  });
  return {
    wrapper, home, theaterContainer, main, theater, reset, storage,
    get moves() { return moves; },
    click: button => button.dispatchEvent(new Event('click')),
    resize: matches => { query.matches = matches; query.dispatchEvent(new Event('change')); },
  };
}

test('switches between theater and standard, including repeated transitions', () => {
  const page = setup();
  for (let i = 0; i < 3; i++) {
    page.click(page.theater);
    assert.equal(page.wrapper.parentElement, page.theaterContainer);
    assert.equal(page.theater.attributes['aria-pressed'], 'true');
    assert.equal(page.theater.innerHTML, 'small');
    page.click(page.theater);
    assert.equal(page.wrapper.parentElement, page.home);
    assert.equal(page.wrapper.classList.contains('mt-theater-wrapper'), false);
    assert.equal(page.theater.attributes['aria-pressed'], 'false');
    assert.equal(page.theater.innerHTML, 'theater');
  }
});

test('remembers theater for videos and live streams and remembers turning it off', () => {
  const first = setup({ live: false });
  first.click(first.theater);
  for (const live of [false, true]) {
    const next = setup({ storage: first.storage, live });
    assert.equal(next.wrapper.parentElement, next.theaterContainer);
  }
  const next = setup({ storage: first.storage });
  next.click(next.theater);
  assert.equal(setup({ storage: first.storage }).theater.attributes['aria-pressed'], 'false');
});

test('obsolete streamer preferences fall back to the standard layout', () => {
  const storage = new Map([['moartube-watch-modes', '{"video":"standard","live":"streamer"}']]);
  const page = setup({ storage });
  assert.equal(page.wrapper.parentElement, page.home);
  assert.equal(page.theater.attributes['aria-pressed'], 'false');
  page.click(page.theater);
  assert.deepEqual(JSON.parse(storage.get('moartube-watch-modes')), { video: 'theater', live: 'theater' });
});

test('small screens temporarily use standard layout without losing the saved preference', () => {
  const page = setup();
  page.click(page.theater);
  page.resize(false);
  assert.equal(page.wrapper.parentElement, page.home);
  const next = setup({ storage: page.storage, desktop: false });
  assert.equal(next.wrapper.parentElement, next.home);
  next.resize(true);
  assert.equal(next.wrapper.parentElement, next.theaterContainer);
});

test('invalid or unavailable storage does not break switching', () => {
  for (const saved of ['{', 'null', '{"video":"streamer","live":"invalid"}']) {
    const page = setup({ storage: new Map([['moartube-watch-modes', saved]]) });
    assert.equal(page.wrapper.parentElement, page.home);
    page.click(page.theater);
    assert.equal(page.wrapper.parentElement, page.theaterContainer);
  }
  const storage = { get() { throw Error('blocked'); }, set() { throw Error('blocked'); } };
  const page = setup({ storage });
  page.click(page.theater);
  assert.equal(page.wrapper.parentElement, page.theaterContainer);
});

test('embeds leave stored watch preferences and page layout alone', () => {
  const storage = new Map([['moartube-watch-modes', '{"video":"theater","live":"streamer"}']]);
  const page = setup({ storage, embedded: true });
  page.click(page.theater);
  page.reset();
  assert.equal(page.moves, 0);
  assert.equal(storage.get('moartube-watch-modes'), '{"video":"theater","live":"streamer"}');
});

test('uses atomic moves when available and teardown restores layout without overwriting preference', () => {
  const page = setup({ atomic: true });
  page.click(page.theater);
  assert.equal(page.moves, 1);
  const saved = page.storage.get('moartube-watch-modes');
  page.reset();
  assert.equal(page.wrapper.parentElement, page.home);
  assert.equal(page.moves, 2);
  assert.equal(page.storage.get('moartube-watch-modes'), saved);
});
