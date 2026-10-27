import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  readCachedComments,
  noStoreComments,
  COMMENT_DATA_CACHE_CONTROL,
} from '@/utils/comment-cache.js';

const epoch = '11111111-1111-4111-8111-111111111111';
const request = (query: object, headers = {}) => ({ query, headers }) as FastifyRequest;
const reply = () => ({ header: vi.fn() }) as unknown as FastifyReply;
describe('shared comment cache policy', () => {
  it('marks responses uncacheable before validation and authentication', async () => {
    const response = reply();
    await noStoreComments(request({}), response);
    expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it.each([{}, { epoch }, { revision: 1 }])('does not cache unversioned URLs %j', async (query) => {
    const state = vi.fn(),
      response = reply();
    expect(
      await readCachedComments(request(query), response, state, async () => ({ ok: true }))
    ).toEqual({ ok: true });
    expect(state).not.toHaveBeenCalled();
    expect(response.header).toHaveBeenCalledTimes(1);
  });
  it('bypasses authenticated reads', async () => {
    const state = vi.fn(),
      response = reply();
    await readCachedComments(
      request({ epoch, revision: 1 }, { authorization: 'Bearer token' }),
      response,
      state,
      async () => ({})
    );
    expect(state).not.toHaveBeenCalled();
    expect(response.header).toHaveBeenCalledTimes(1);
  });
  it('shares a successful stable revision for an hour without HTTP browser retention', async () => {
    const response = reply(),
      state = vi.fn().mockResolvedValue({ epoch, version: 1 });
    await readCachedComments(request({ epoch, revision: 1 }), response, state, async () => ({}));
    expect(response.header).toHaveBeenLastCalledWith('Cache-Control', COMMENT_DATA_CACHE_CONTROL);
    expect(state).toHaveBeenCalledTimes(2);
  });
  it.each([
    [
      { epoch: 'old', version: 1 },
      { epoch, version: 1 },
    ],
    [
      { epoch, version: 0 },
      { epoch, version: 1 },
    ],
    [
      { epoch, version: 1 },
      { epoch: 'replacement', version: 1 },
    ],
    [
      { epoch, version: 1 },
      { epoch, version: 2 },
    ],
  ])('does not cache a stale URL or a read racing a change %j', async (before, after) => {
    const response = reply(),
      state = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    await readCachedComments(request({ epoch, revision: 1 }), response, state, async () => ({}));
    expect(response.header).toHaveBeenCalledTimes(1);
  });
  it('does not cache a missing record', async () => {
    const response = reply(),
      state = vi.fn().mockResolvedValue({ epoch, version: 1 });
    expect(
      await readCachedComments(request({ epoch, revision: 1 }), response, state, async () => null)
    ).toBeNull();
    expect(response.header).toHaveBeenCalledTimes(1);
  });
  it('keeps failures uncacheable and propagates them', async () => {
    const response = reply();
    await expect(
      readCachedComments(
        request({ epoch, revision: 1 }),
        response,
        async () => ({ epoch, version: 1 }),
        async () => {
          throw new Error('read failed');
        }
      )
    ).rejects.toThrow('read failed');
    expect(response.header).toHaveBeenCalledTimes(1);
  });
});
