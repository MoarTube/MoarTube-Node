import { gunzipSync } from 'node:zlib';

// Extract only the executable from a checksum-verified official archive; never extract paths.
export function unpackDarwin(data) {
  const tar = gunzipSync(data, { maxOutputLength: 128 * 1024 * 1024 });
  let binary;
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const size = Number.parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(),
      8
    );
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length)
      throw new Error('Invalid cloudflared archive');
    if ((name === 'cloudflared' || name === './cloudflared') && [0, 48].includes(header[156])) {
      if (binary) throw new Error('Duplicate cloudflared archive entry');
      binary = tar.subarray(offset + 512, offset + 512 + size);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!binary?.length) throw new Error('Missing cloudflared executable in archive');
  return binary;
}
