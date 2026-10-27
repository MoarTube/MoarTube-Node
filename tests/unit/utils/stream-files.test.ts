import { afterEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeUpload } from '../../../src/utils/stream-files.js';

const directories: string[] = [];
async function target() {
  const dir = await mkdtemp(path.join(tmpdir(), 'moartube-stream-test-'));
  directories.push(dir);
  return path.join(dir, 'segment.ts');
}
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    if (
      path.dirname(dir) !== path.resolve(tmpdir()) ||
      !path.basename(dir).startsWith('moartube-stream-test-')
    )
      throw new Error('Unexpected fixture');
    await rm(dir, { recursive: true, force: true });
  }
});
describe('atomic streaming uploads', () => {
  it('writes exact content from many chunks without calling toBuffer', async () => {
    const file = await target();
    const chunks = Array.from({ length: 100 }, (_, i) => Buffer.alloc(1024, i));
    await writeUpload({ file: Readable.from(chunks) }, file, 102400);
    expect(await readFile(file)).toEqual(Buffer.concat(chunks));
    expect(await readdir(path.dirname(file))).toEqual(['segment.ts']);
  });
  it('keeps the previous live manifest and removes partial files on upstream failure', async () => {
    const file = await target();
    await writeFile(file, 'old');
    const stream = Readable.from(
      (async function* () {
        yield Buffer.from('new');
        throw new Error('disconnected');
      })()
    );
    await expect(writeUpload({ file: stream }, file, 1024)).rejects.toThrow('disconnected');
    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await readdir(path.dirname(file))).toEqual(['segment.ts']);
  });
  it('rejects oversize and multipart-truncated uploads without publishing them', async () => {
    const file = await target();
    await expect(
      writeUpload({ file: Readable.from([Buffer.alloc(11)]) }, file, 10)
    ).rejects.toThrow('limit');
    await expect(
      writeUpload(
        { file: Object.assign(Readable.from(['partial']), { truncated: true }) },
        file,
        1024
      )
    ).rejects.toThrow('truncated');
    expect(await readdir(path.dirname(file))).toEqual([]);
  });
});
