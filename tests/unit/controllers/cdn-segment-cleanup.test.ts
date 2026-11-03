import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { StreamsController } from '@/controllers/streams.js';

const state = vi.hoisted(() => ({ videosDirectoryPath: '' }));
vi.mock('@config/index.js', () => ({ getConfig: () => ({ paths: state }) }));
let root: string, app: FastifyInstance;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moartube-segment-cleanup-'));
  state.videosDirectoryPath = root;
  const controller = new StreamsController(
    {} as never,
    {} as never,
    { invalidateStreamMedia: vi.fn().mockResolvedValue(undefined) } as never
  );
  app = Fastify();
  app.post('/:videoId/:format/:resolution/remove', controller.removeSegment);
});
afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe('filesystem segment cleanup acknowledgements', () => {
  it('reports a real unlink failure, then acknowledges successful and already-absent retries', async () => {
    const target = path.join(root, 'abcdefghijk/adaptive/m3u8/720p/segment-run-0.ts');
    // unlink cannot remove a directory: deterministic real OS failure on Windows and Linux.
    await mkdir(target, { recursive: true });
    const remove = () =>
      app.inject({
        method: 'POST',
        url: '/abcdefghijk/m3u8/720p/remove',
        payload: { segmentName: 'segment-run-0.ts' },
      });
    const failed = await remove();
    expect(failed.json()).toMatchObject({ isError: true });
    await access(target);
    await rm(target, { recursive: true });
    await writeFile(target, 'old segment bytes');
    expect((await remove()).json()).toMatchObject({ isError: false });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await remove()).json()).toMatchObject({ isError: false });
  });
});
