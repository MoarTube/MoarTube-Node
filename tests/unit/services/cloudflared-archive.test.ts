import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { unpackDarwin } from '../../../scripts/cloudflared-archive.mjs';

function archive(name: string, data: Buffer, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write(type, 156);
  return gzipSync(
    Buffer.concat([
      header,
      data,
      Buffer.alloc((512 - (data.length % 512)) % 512),
      Buffer.alloc(1024),
    ])
  );
}

describe('macOS bundle extraction', () => {
  it('extracts only a regular executable without materializing archive paths', () => {
    const binary = Buffer.from('official binary bytes');
    expect(unpackDarwin(archive('./cloudflared', binary))).toEqual(binary);
    expect(() => unpackDarwin(archive('../cloudflared', binary))).toThrow('Missing');
    expect(() => unpackDarwin(archive('cloudflared', binary, '2'))).toThrow('Missing');
  });

  it('rejects corrupt compressed input and truncated executable data', () => {
    expect(() => unpackDarwin(Buffer.from('invalid'))).toThrow();
    const header = Buffer.alloc(512);
    header.write('cloudflared');
    header.write('77777777777\0', 124);
    expect(() => unpackDarwin(gzipSync(header))).toThrow('Invalid');
  });
});
