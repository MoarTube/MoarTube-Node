import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lstat, opendir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { getDirectorySize, getStorageMetrics } from '@/utils/storage-metrics.js';

vi.mock('node:fs/promises', () => ({ lstat: vi.fn(), opendir: vi.fn(), statfs: vi.fn() }));

function stats(type: 'file' | 'directory' | 'link', size = 0): Awaited<ReturnType<typeof lstat>> {
  return {
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'link',
    size,
  } as Awaited<ReturnType<typeof lstat>>;
}
function entry(name: string, type: 'file' | 'directory' | 'link') {
  return { name, isDirectory: () => type === 'directory', isFile: () => type === 'file' };
}
function entries(...items: ReturnType<typeof entry>[]): Awaited<ReturnType<typeof opendir>> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  } as Awaited<ReturnType<typeof opendir>>;
}
function error(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
beforeEach(() => vi.resetAllMocks());

describe('local storage metrics', () => {
  it('counts nested media files without reading contents or following directory links', async () => {
    vi.mocked(lstat)
      .mockResolvedValueOnce(stats('directory'))
      .mockResolvedValueOnce(stats('file', 7))
      .mockResolvedValueOnce(stats('directory'))
      .mockResolvedValueOnce(stats('file', 1024));
    vi.mocked(opendir)
      .mockResolvedValueOnce(
        entries(
          entry('other-media', 'file'),
          entry('videos', 'directory'),
          entry('external', 'link')
        )
      )
      .mockResolvedValueOnce(entries(entry('source.mp4', 'file')));
    expect(await getDirectorySize('/media')).toBe(1031);
    expect(lstat).toHaveBeenCalledWith(path.join('/media', 'videos', 'source.mp4'));
    expect(lstat).not.toHaveBeenCalledWith(path.join('/media', 'external'));
  });

  it('ignores roots that are files and directory roots that are symbolic links', async () => {
    vi.mocked(lstat).mockResolvedValueOnce(stats('file', 100));
    expect(await getDirectorySize('/media')).toBe(0);
    vi.mocked(lstat).mockResolvedValueOnce({ ...stats('directory'), isSymbolicLink: () => true });
    expect(await getDirectorySize('/media')).toBe(0);
    expect(opendir).not.toHaveBeenCalled();
  });

  it('skips files removed or replaced during finalization and continues counting other files', async () => {
    vi.mocked(lstat)
      .mockResolvedValueOnce(stats('directory'))
      .mockRejectedValueOnce(error('ENOENT'))
      .mockResolvedValueOnce(stats('link'))
      .mockResolvedValueOnce(stats('file', 32));
    vi.mocked(opendir).mockResolvedValue(
      entries(entry('deleted', 'file'), entry('replaced', 'file'), entry('remaining', 'file'))
    );
    expect(await getDirectorySize('/media')).toBe(32);
  });

  it('tolerates a directory disappearing during a scan', async () => {
    vi.mocked(lstat).mockResolvedValue(stats('directory'));
    vi.mocked(opendir).mockRejectedValue(error('ENOENT'));
    expect(await getDirectorySize('/media')).toBe(0);
  });

  it('propagates file permission errors instead of reporting partial usage', async () => {
    vi.mocked(lstat)
      .mockResolvedValueOnce(stats('directory'))
      .mockRejectedValueOnce(error('EACCES'));
    vi.mocked(opendir).mockResolvedValue(entries(entry('private', 'file')));
    await expect(getDirectorySize('/media')).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('propagates directory access errors', async () => {
    vi.mocked(lstat).mockRejectedValue(error('EACCES'));
    await expect(getDirectorySize('/media')).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('reports media bytes and the capacity of the containing filesystem', async () => {
    vi.mocked(lstat)
      .mockResolvedValueOnce(stats('directory'))
      .mockResolvedValueOnce(stats('file', 32));
    vi.mocked(opendir).mockResolvedValue(entries(entry('source.mp4', 'file')));
    vi.mocked(statfs).mockResolvedValue({ bavail: 10, blocks: 100, bsize: 4096 } as Awaited<
      ReturnType<typeof statfs>
    >);
    expect(await getStorageMetrics('/media')).toEqual({
      storageMode: 'filesystem',
      mediaBytes: 32,
      availableBytes: 40960,
      totalBytes: 409600,
    });
    expect(statfs).toHaveBeenCalledWith('/media');
  });

  it('finds capacity from an existing ancestor before the media folder has been created', async () => {
    const media = path.resolve('data', 'media');
    vi.mocked(lstat).mockRejectedValue(error('ENOENT'));
    vi.mocked(statfs)
      .mockRejectedValueOnce(error('ENOENT'))
      .mockResolvedValueOnce({ bavail: 10, blocks: 100, bsize: 4096 } as Awaited<
        ReturnType<typeof statfs>
      >);
    expect((await getStorageMetrics(media)).mediaBytes).toBe(0);
    expect(statfs).toHaveBeenNthCalledWith(2, path.dirname(media));
  });

  it.each(['EACCES', 'ENOENT'])(
    'fails at the filesystem root without looping on %s',
    async (code) => {
      vi.mocked(lstat).mockRejectedValue(error('ENOENT'));
      vi.mocked(statfs).mockRejectedValue(error(code));
      const root = path.parse(path.resolve('.')).root;
      await expect(getStorageMetrics(root)).rejects.toMatchObject({ code });
      expect(statfs).toHaveBeenCalledTimes(1);
    }
  );
});
