import { StringDecoder } from 'node:string_decoder';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { writeUpload } from './stream-files.js';

export async function* transformManifest(
  source: AsyncIterable<Buffer>,
  transform: (line: string) => string = (line) => line,
  finalize = false
): AsyncGenerator<Buffer> {
  const decoder = new StringDecoder('utf8');
  let remainder = '';
  const state = { ended: false };
  const process = (line: string): Buffer => {
    let result = transform(line.replace(/\r$/, ''));
    if (finalize) {
      result = result.replace('#EXT-X-PLAYLIST-TYPE:EVENT', '#EXT-X-PLAYLIST-TYPE:VOD');
    }
    if (result.trim() === '#EXT-X-ENDLIST') {
      state.ended = true;
    }
    return Buffer.from(result + '\n');
  };
  for await (const chunk of source) {
    remainder += decoder.write(chunk);
    let start = 0,
      end: number;
    while ((end = remainder.indexOf('\n', start)) !== -1) {
      if (end - start > 1024 ** 2) {
        throw new Error('Manifest line exceeds byte limit');
      }
      yield process(remainder.slice(start, end));
      start = end + 1;
    }
    remainder = remainder.slice(start);
    if (remainder.length > 1024 ** 2) {
      throw new Error('Manifest line exceeds byte limit');
    }
  }
  remainder += decoder.end();
  if (remainder) {
    yield process(remainder);
  }
  if (finalize && !state.ended) {
    yield Buffer.from('#EXT-X-ENDLIST\n');
  }
}

export async function rewriteManifestFile(
  file: string,
  transform: (line: string) => string,
  finalize = false
): Promise<void> {
  const input = fs.createReadStream(file);
  try {
    await writeUpload(
      { file: Readable.from(transformManifest(input, transform, finalize)) },
      file,
      10 * 1024 ** 3
    );
  } finally {
    input.destroy();
  }
}
