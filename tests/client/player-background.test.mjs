import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializePlayerBackground } from '../../client/videojs-10.2.0-background.js';

function setup(width = 0, height = 0, player = { classes: new Set() }) {
  const controller = new AbortController();
  const media = new EventTarget();
  Object.assign(media, { videoWidth: width, videoHeight: height });
  player.classList = { toggle: (name, enabled) => enabled ? player.classes.add(name) : player.classes.delete(name) };
  initializePlayerBackground({ player, media, signal: controller.signal });
  return { player, media, controller,
    get matchesPage() { return player.classes.has('mt-widescreen-background'); },
    emit: event => media.dispatchEvent(new Event(event)),
  };
}

test('metadata alone keeps the initial background black until playback starts', () => {
  const page = setup(1920, 1080);
  assert.equal(page.matchesPage, false);
  page.emit('loadedmetadata');
  assert.equal(page.matchesPage, false);
  page.emit('playing');
  assert.equal(page.matchesPage, true);
  page.emit('pause');
  assert.equal(page.matchesPage, true);
});

for (const [width, height] of [[1920, 1080], [1280, 720], [854, 480], [426, 240]]) {
  test(`${width}x${height} playback matches the page background`, () => {
    const page = setup(width, height);
    page.emit('playing');
    assert.equal(page.matchesPage, true);
  });
}

for (const [width, height] of [[640, 480], [1080, 1920], [1080, 1080], [2560, 1080], [1920, 1088], [0, 0], [1920, 0], [NaN, 1080], [Infinity, 1080]]) {
  test(`${width}x${height} playback keeps the container black`, () => {
    const page = setup(width, height);
    page.emit('playing');
    assert.equal(page.matchesPage, false);
  });
}

test('dimensions arriving after playback and adaptive aspect-ratio changes update the background', () => {
  const page = setup();
  page.emit('playing');
  assert.equal(page.matchesPage, false);
  Object.assign(page.media, { videoWidth: 1920, videoHeight: 1080 });
  page.emit('loadedmetadata');
  assert.equal(page.matchesPage, true);
  Object.assign(page.media, { videoWidth: 1440, videoHeight: 1080 });
  page.emit('resize');
  assert.equal(page.matchesPage, false);
  Object.assign(page.media, { videoWidth: 1280, videoHeight: 720 });
  page.emit('resize');
  assert.equal(page.matchesPage, true);
});

for (const event of ['loadstart', 'emptied']) {
  test(`${event} resets the background even when old video dimensions are still present`, () => {
    const page = setup(1920, 1080);
    page.emit('playing');
    page.emit(event);
    assert.equal(page.matchesPage, false);
    page.emit('loadedmetadata');
    assert.equal(page.matchesPage, false);
    page.emit('playing');
    assert.equal(page.matchesPage, true);
  });
}

test('switching sources clears the old choice and detached media cannot change the new one', () => {
  const previous = setup(1920, 1080);
  previous.emit('playing');
  previous.controller.abort();
  const next = setup(640, 480, previous.player);
  next.emit('playing');
  assert.equal(next.matchesPage, false);
  previous.emit('playing');
  assert.equal(next.matchesPage, false);
  next.controller.abort();
  next.emit('playing');
  assert.equal(next.matchesPage, false);
});
