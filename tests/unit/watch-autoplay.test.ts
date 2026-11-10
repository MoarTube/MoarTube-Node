import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import ejs from 'ejs';

it.each([
  ['', true],
  ['#p1', false],
  ['#p12345', false],
  ['#other', true],
  ['#preview', true],
])('sets watch autoplay for initial fragment %s to %s', async (hash, autoStart) => {
  const template = readFileSync('public/views/watch.ejs', 'utf8');
  const start = template.indexOf('async initializeVideoPlayer(');
  const end = template.indexOf('connectWebsocket()', start);
  const method = ejs.render(template.slice(start, end), { cachedAsset: (url: string) => url }).replace(
    /import\(this\.EXTERNAL_RESOURCES_BASE_URL \+ ["'][^"']+["']\)/,
    'Promise.resolve(playerModule)'
  );
  const calls: Record<string, unknown>[] = [];
  const instance = vm.runInNewContext('({' + method + '})', {
    document: { getElementById: () => ({}) },
    playerModule: { createVideoPlayer(options: Record<string, unknown>) { calls.push(options); } },
  });
  Object.assign(instance, { HASH_VALUE: hash, TIME_PARAMETER: 30, VIDEO_ID: 'sample' });
  for (const live of [false, true]) {
    await instance.initializeVideoPlayer([], [], live);
    expect(calls.at(-1)).toMatchObject({ autoStart, isStreaming: live, timeParameter: 30 });
  }
});
