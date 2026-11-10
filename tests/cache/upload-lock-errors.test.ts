vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ acquire: vi.fn(), real: undefined as any }));
vi.mock('@/utils/file-lock.js', async (original) => {
  const actual = await original<typeof import('@/utils/file-lock.js')>();
  state.real = actual.acquireFileLock;
  return { acquireFileLock: state.acquire };
});
import { writeUpload } from '@/utils/stream-files.js';
let root: string, file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-upload-lock-'));
  file = path.join(root, 'video/file');
  state.acquire.mockReset().mockImplementation(state.real);
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});
it('retries a released-owner race while retaining the publication parent', async () => {
  state.acquire.mockImplementationOnce(() => {
    throw Object.assign(new Error('owner disappeared'), { code: 'ENOENT' });
  });
  await expect(
    writeUpload({ file: Readable.from(['complete']) }, file, 100, new AbortController().signal)
  ).resolves.toBe(false);
  expect(fs.readFileSync(file, 'utf8')).toBe('complete');
});
it('does not retry an arbitrary thrown value', async () => {
  state.acquire.mockImplementation(() => {
    throw 'failure';
  });
  await expect(writeUpload({ file: Readable.from(['bytes']) }, file, 100)).rejects.toBe('failure');
});
it('does not retry a missing publication parent', async () => {
  state.acquire.mockImplementation(() => {
    for (const item of fs.readdirSync(path.dirname(file)))
      fs.unlinkSync(path.join(path.dirname(file), item));
    fs.rmdirSync(path.dirname(file));
    throw Object.assign(new Error('parent removed'), { code: 'ENOENT' });
  });
  await expect(writeUpload({ file: Readable.from(['bytes']) }, file, 100)).rejects.toThrow(
    'parent removed'
  );
});
it('bounds lock retries without publishing partial bytes', async () => {
  state.acquire.mockImplementation(() => {
    throw new Error('Another settings change is in progress');
  });
  const rejected = expect(
    writeUpload({ file: Readable.from(['bytes']) }, file, 100)
  ).rejects.toThrow('in progress');
  await rejected;
  expect(state.acquire).toHaveBeenCalledTimes(1000);
  expect(fs.existsSync(file)).toBe(false);
});
