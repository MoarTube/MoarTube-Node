import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializePlayerLayout } from '../../client/videojs-10.2.0-layout.js';

function wrapper() {
  const classes = new Set(), properties = new Map();
  return { classes, properties,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
  };
}

function setup(width = 0, height = 0, container = wrapper()) {
  const media = new EventTarget(), controller = new AbortController();
  Object.assign(media, { videoWidth: width, videoHeight: height });
  initializePlayerLayout({ wrapper: container, media, signal: controller.signal });
  return { media, controller, wrapper: container,
    get portrait() { return container.classes.has('mt-portrait-video'); },
    get height() { return container.properties.get('--mt-video-height'); },
    emit: type => media.dispatchEvent(new Event(type)),
  };
}

for (const [width, height] of [[1080, 1920], [720, 1280], [480, 640], [720, 1600]]) {
  test(`${width}x${height} metadata supplies the natural portrait height before playback`, () => {
    const page = setup(width, height);
    assert.equal(page.portrait, false);
    page.emit('loadedmetadata');
    assert.equal(page.portrait, true);
    assert.equal(page.height, `${height / width * 100}%`);
  });
}

test('landscape, square, and unknown video dimensions retain the default player size', () => {
  for (const [width, height] of [[1920, 1080], [640, 480], [1080, 1080], [0, 0], [0, 1920], [NaN, 1920], [1080, Infinity]]) {
    const page = setup(width, height);
    page.emit('loadedmetadata');
    page.emit('playing');
    assert.equal(page.portrait, false);
    assert.equal(page.height, undefined);
  }
});

test('adaptive dimension changes update portrait height and restore landscape sizing', () => {
  const page = setup(1080, 1920);
  page.emit('playing');
  Object.assign(page.media, { videoWidth: 480, videoHeight: 640 });
  page.emit('resize');
  assert.equal(page.height, `${640 / 480 * 100}%`);
  Object.assign(page.media, { videoWidth: 1280, videoHeight: 720 });
  page.emit('resize');
  assert.equal(page.portrait, false);
  assert.equal(page.height, undefined);
});

test('loading a source clears the previous ratio even while old dimensions are still exposed', () => {
  const page = setup(1080, 1920);
  for (const event of ['loadstart', 'emptied']) {
    page.emit('loadedmetadata');
    assert.equal(page.portrait, true);
    page.emit(event);
    assert.equal(page.portrait, false);
    assert.equal(page.height, undefined);
  }
});

test('switching sources resets layout and detached media cannot restore an old portrait ratio', () => {
  const first = setup(1080, 1920);
  first.emit('loadedmetadata');
  first.controller.abort();
  assert.equal(first.portrait, false);
  const second = setup(1920, 1080, first.wrapper);
  second.emit('loadedmetadata');
  first.emit('playing');
  first.emit('resize');
  assert.equal(second.portrait, false);
  assert.equal(second.height, undefined);
});
