import { expect, it } from 'vitest';
import { isActiveLivePlaylist } from '@/utils/live-playlist-cache.js';

const active = '#EXTM3U\n#EXT-X-TARGETDURATION:0000000002\n#EXTINF:2,\nsegment-run-0.ts\n';
it.each([
  [active, true],
  [active.replaceAll('\n', '\r\n'), true],
  [active + '#EXT-X-ENDLIST\n', false],
  [active.replace('#EXTINF:2', '#EXTINF:0'), false],
  [active.replace('DURATION:0000000002', 'DURATION:0'), false],
  [active.replace('DURATION:0000000002', 'DURATION:invalid'), false],
  [active.replace('segment-run-0.ts\n', ''), false],
  ['#EXTM3U\n', false],
  ['', false],
  ['invalid', false],
  [active.replace('#EXTINF:2', '#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2'), false],
  ['#EXTM3U\n#MOARTUBE-LIVE\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n', true],
  ['#EXTM3U\n#MOARTUBE-LIVE\n#EXT-X-STREAM-INF:BANDWIDTH=100\n', false],
  ['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmanifest-720p.m3u8\n', false],
] as const)('classifies live snapshot %j as active=%s', (bytes, expected) => {
  expect(isActiveLivePlaylist(bytes)).toBe(expected);
});

it('detects the end of a large recording without buffering its full playlist', () => {
  expect(isActiveLivePlaylist(active, '#EXTINF:2,\nlast.ts\n')).toBe(true);
  expect(isActiveLivePlaylist(active, '#EXTINF:2,\nlast.ts\n#EXT-X-ENDLIST\n')).toBe(false);
});
