import { gzip as gzipCallback } from 'node:zlib';
import { promisify } from 'node:util';
import type { FastifyRequest, FastifyReply } from 'fastify';
const gzip = promisify(gzipCallback);
export function acceptsGzip(header = ''): boolean {
  let wildcard = false;
  for (const entry of header.toLowerCase().split(',')) {
    const [name, ...parameters] = entry.trim().split(';');
    const parameter = parameters
      .map((value) => value.trim())
      .find((value) => value.startsWith('q='));
    const quality = parameter === undefined ? 1 : Number(parameter.slice(2));
    const accepted = Number.isFinite(quality) && quality > 0 && quality <= 1;
    if (name === 'gzip') {
      return accepted;
    }
    if (name === '*') {
      wildcard = accepted;
    }
  }
  return wildcard;
}
export function varyEncoding(reply: FastifyReply): void {
  const current = String(reply.getHeader('Vary') ?? '');
  if (
    !current
      .toLowerCase()
      .split(',')
      .map((value) => value.trim())
      .includes('accept-encoding')
  ) {
    reply.header('Vary', current ? current + ', Accept-Encoding' : 'Accept-Encoding');
  }
}
export async function compressTextResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<unknown> {
  if (
    reply.statusCode !== 200 ||
    request.method === 'HEAD' ||
    reply.hasHeader('Content-Encoding') ||
    !/^(?:text\/|application\/(?:json|javascript))/.test(String(reply.getHeader('Content-Type'))) ||
    !(typeof payload === 'string' || Buffer.isBuffer(payload)) ||
    Buffer.byteLength(payload) < 1024
  ) {
    return payload;
  }
  varyEncoding(reply);
  if (!acceptsGzip(request.headers['accept-encoding'])) {
    return payload;
  }
  const compressed = await gzip(payload);
  reply.header('Content-Encoding', 'gzip');
  reply.removeHeader('Content-Length');
  return compressed;
}
