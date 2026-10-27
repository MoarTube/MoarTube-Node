import fs from 'node:fs';
import { Readable } from 'node:stream';
import { stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { publicFilePath, isPathSegment } from './public-path.js';
import { acceptsGzip, varyEncoding } from './http-compression.js';

export interface ByteRange {
  start: number;
  end: number;
}
/** Undefined means ignore an unsupported range; null is an unsatisfiable/invalid byte range. */
export function byteRange(header: string | undefined, size: number): ByteRange | null | undefined {
  if (header === undefined || !header.startsWith('bytes=') || header.includes(',')) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) {
    return null;
  }
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return null;
    }
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]),
    end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function servePublicFile(
  request: FastifyRequest,
  reply: FastifyReply,
  root: string,
  parts: string[],
  contentType: string,
  options: { live?: boolean; ranges?: boolean; onBytes?: (bytes: number) => void } = {}
): Promise<FastifyReply> {
  reply.header('Cache-Control', 'no-store');
  if (!parts.every(isPathSegment)) {
    return reply.status(400).send({ isError: true, message: 'Invalid filename' });
  }
  let file: string;
  let info: fs.Stats;
  try {
    file = await publicFilePath(root, parts);
    info = await stat(file);
  } catch {
    return reply.status(404).send({ isError: true, message: 'File not found' });
  }
  if (!info.isFile()) {
    return reply.status(404).send({ isError: true, message: 'File not found' });
  }
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
  const modified = info.mtime.toUTCString();
  reply.header('Content-Type', contentType).header('X-Content-Type-Options', 'nosniff');
  const text = /^(?:text\/|application\/javascript|image\/svg)/.test(contentType);
  if (text && info.size >= 1024) {
    varyEncoding(reply);
  }
  if (!options.live) {
    reply
      .header('Cache-Control', 'public, max-age=0, must-revalidate')
      .header('ETag', etag)
      .header('Last-Modified', modified);
    const tag = request.headers['if-none-match'];
    const unchanged =
      tag !== undefined
        ? tag
            .split(',')
            .some(
              (value) =>
                value.trim() === '*' ||
                value.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')
            )
        : request.headers['if-modified-since'] !== undefined &&
          Math.floor(info.mtimeMs / 1000) * 1000 <=
            Date.parse(request.headers['if-modified-since']);
    if (unchanged) {
      return reply.status(304).send();
    }
  }
  let range: ByteRange | null | undefined;
  if (options.ranges) {
    reply.header('Accept-Ranges', 'bytes');
    const header = request.headers['if-range'];
    const ifRange = typeof header === 'string' ? header : undefined;
    const useRange =
      ifRange === undefined ||
      (!ifRange.startsWith('W/') &&
        !ifRange.startsWith('"') &&
        Date.parse(ifRange) >= Math.floor(info.mtimeMs / 1000) * 1000);
    if (request.method === 'GET' && useRange) {
      range = byteRange(request.headers.range, info.size);
    }
    if (range === null) {
      return reply
        .header('Content-Range', `bytes */${String(info.size)}`)
        .header('Cache-Control', 'no-store')
        .status(416)
        .send();
    }
  }
  const length = range ? range.end - range.start + 1 : info.size;
  if (range) {
    reply
      .status(206)
      .header(
        'Content-Range',
        `bytes ${String(range.start)}-${String(range.end)}/${String(info.size)}`
      );
  }

  const compress =
    text && !range && info.size >= 1024 && acceptsGzip(request.headers['accept-encoding']);
  if (compress) {
    reply.header('Content-Encoding', 'gzip');
  } else {
    reply.header('Content-Length', length);
  }
  if (request.method === 'HEAD') {
    return reply.send(Readable.from([]));
  }
  const stream = fs.createReadStream(file, range ?? undefined);
  if (options.onBytes) {
    stream.once('close', () => options.onBytes?.(stream.bytesRead));
  }
  if (!compress) {
    return reply.send(stream);
  }
  const compressed = createGzip();
  stream.on('error', (error) => compressed.destroy(error));
  compressed.once('close', () => stream.destroy());
  return reply.send(stream.pipe(compressed));
}
