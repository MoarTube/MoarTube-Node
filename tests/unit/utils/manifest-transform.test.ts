import { describe, expect, it } from 'vitest';
import { transformManifest } from '../../../src/utils/manifest-transform.js';
async function text(input: string, finalize: boolean) {
  async function* source() {
    const buffer = Buffer.from(input);
    for (let i = 0; i < buffer.length; i += 3) yield buffer.subarray(i, i + 3);
  }
  let output = '';
  for await (const chunk of transformManifest(
    source(),
    (line) => line.replace('/dynamic/', '/static/'),
    finalize
  ))
    output += chunk;
  return output;
}
describe('incremental playlist transforms', () => {
  it('rewrites and finalizes split UTF-8 lines without duplicate ENDLIST tags', async () => {
    const source =
      '#EXTM3U\r\n#EXT-X-PLAYLIST-TYPE:EVENT\r\n#EXTINF:2,\r\nhttps://example.test/dynamic/🌻.ts';
    const output = await text(source, true);
    expect(output).toContain('https://example.test/static/🌻.ts');
    expect(output).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(output.match(/#EXT-X-ENDLIST/g)).toHaveLength(1);
    expect(await text(output, true)).toBe(output);
  });
  it('does not add ENDLIST during URL-only maintenance', async () => {
    expect(await text('#EXTM3U\n', false)).toBe('#EXTM3U\n');
  });
});
