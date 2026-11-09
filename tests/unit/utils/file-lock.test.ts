import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireFileLock } from '@/utils/file-lock.js';

let root: string;
let resource: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-file-lock-'));
  resource = path.join(root, 'settings.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
it('excludes another writer and releases ownership after success', () => {
  const release = acquireFileLock(resource);
  expect(() => acquireFileLock(resource)).toThrow('in progress');
  release();
  acquireFileLock(resource)();
  expect(fs.existsSync(resource + '.writer-lock')).toBe(false);
});
it.each([[], ['invalid'], ['invalid', 'other'], [undefined]].map((entries) => ({ entries })))(
  'rejects ambiguous ownership $entries',
  ({ entries }) => {
    fs.mkdirSync(resource + '.writer-lock');
    vi.spyOn(fs, 'readdirSync').mockReturnValue(entries as never);
    expect(() => acquireFileLock(resource)).toThrow('in progress');
  }
);
it('recovers a dead writer and leaves live or inaccessible owners alone', () => {
  const lock = resource + '.writer-lock';
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, '99999999-abcd'), '');
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('dead'), { code: 'ESRCH' });
  });
  const release = acquireFileLock(resource);
  expect(kill).toHaveBeenCalledWith(99999999, 0);
  release();
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, '99999999-abcd'), '');
  kill.mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EPERM' });
  });
  expect(() => acquireFileLock(resource)).toThrow('in progress');
});
it('does not erase a competing owner when stale recovery races', () => {
  fs.mkdirSync(resource + '.writer-lock');
  fs.writeFileSync(path.join(resource + '.writer-lock', '99999999-abcd'), '');
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('dead'), { code: 'ESRCH' });
  });
  vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error('race');
  });
  expect(() => acquireFileLock(resource)).toThrow('in progress');
});
it.each([false, true])(
  'cleans up after an ownership write fails (cleanup fails=%s)',
  (cleanupFails) => {
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    if (cleanupFails)
      vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {
        throw new Error('race');
      });
    expect(() => acquireFileLock(resource)).toThrow('disk full');
    expect(fs.existsSync(resource + '.writer-lock')).toBe(cleanupFails);
  }
);
it('preserves filesystem errors unrelated to contention', () => {
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
    throw new Error('read only');
  });
  expect(() => acquireFileLock(resource)).toThrow('read only');
});
