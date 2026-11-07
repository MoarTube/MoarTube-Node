import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('client/videojs-10.2.0.js', 'utf8');
const start = source.indexOf("  const overlay = wrapper.querySelector('#mtp-video-overlay');");
const end = source.indexOf('  const information =', start);

for (const [embedded, autoStart, visible] of [
  [false, false, true],
  [false, true, false],
  [true, false, true],
  [true, true, true],
]) {
  test(`poster visibility for embedded=${embedded}, autoStart=${autoStart}`, () => {
    const classes = new Set(['hidden-elem']);
    const attributes = new Map();
    const poster = {
      classList: { remove: value => classes.delete(value) },
      setAttribute: (key, value) => attributes.set(key, value),
    };
    const children = [];
    vm.runInNewContext(source.slice(start, end), {
      embedded, autoStart,
      wrapper: { querySelector: () => poster },
      surface: { append: child => children.push(child) },
    });
    assert.equal(!classes.has('hidden-elem'), visible);
    assert.equal(attributes.has('data-interactive'), true);
    assert.equal(children[0], poster);
  });
}
