import type { FastifyRequest, FastifyReply } from 'fastify';

export const COMMENT_STATE_CACHE_CONTROL = 'public, max-age=0, s-maxage=30, must-revalidate';
export const COMMENT_DATA_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, must-revalidate';
export interface CommentCacheState {
  epoch: string;
  version: number;
}

// Run before validation/authentication too: errors must never acquire a CDN default TTL.
export function noStoreComments(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.header('Cache-Control', 'no-store');
  return Promise.resolve();
}

/** Only cache a successful read when its URL identifies the revision read throughout. */
export async function readCachedComments<T extends object | null>(
  request: FastifyRequest,
  reply: FastifyReply,
  state: () => Promise<CommentCacheState>,
  read: () => Promise<T>
): Promise<T> {
  reply.header('Cache-Control', 'no-store');
  const { epoch, revision } = request.query as { epoch?: string; revision?: number };
  if (
    epoch === undefined ||
    revision === undefined ||
    request.headers.authorization !== undefined
  ) {
    return read();
  }
  const before = await state();
  const data = await read();
  if (data !== null && epoch === before.epoch && revision === before.version) {
    const after = await state();
    if (epoch === after.epoch && revision === after.version) {
      reply.header('Cache-Control', COMMENT_DATA_CACHE_CONTROL);
    }
  }
  return data;
}
