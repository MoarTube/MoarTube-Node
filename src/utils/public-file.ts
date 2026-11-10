import type fs from 'node:fs';
import { fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { open, type FileHandle } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { publicFilePath, isPathSegment } from './public-path.js';
import { acceptsGzip, varyEncoding } from './http-compression.js';
import { retainAsset, retainedAssetPath } from './asset-url.js';
import { isActiveLivePlaylist, livePlaylistCacheControl } from './live-playlist-cache.js';

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
  options: {
    live?: boolean;
    ranges?: boolean;
    onBytes?: (bytes: number) => void;
  } = {}
): Promise<FastifyReply> {
  reply.header('Cache-Control', 'no-store');
  if (!parts.every(isPathSegment)) {
    return reply.status(400).send({ isError: true, message: 'Invalid filename' });
  }
  let handle: FileHandle | undefined;
  let info: fs.Stats;
  let file: string;
  const packaged = ['javascript', 'css', 'fonts'].includes(parts[0] ?? '') && parts.length === 2;
  const version = (request.query as { v?: string } | undefined)?.v;
  const uncached = packaged && (request.query as { cache?: string } | undefined)?.cache === 'off';
  const immutableAsset =
    !uncached && packaged && typeof version === 'string' && /^[a-f0-9]{64}$/.test(version);
  try {
    if (immutableAsset) {
      file = retainedAssetPath(parts, version);
      try {
        handle = await open(file, 'r');
      } catch {
        const current = await publicFilePath(root, parts);
        handle = await open(current, 'r');
        if (retainAsset(current, parts, handle.fd) !== version) {
          await handle.close();
          handle = undefined;
          return await reply
            .type('application/json')
            .status(404)
            .send({ isError: true, message: 'Asset version not found' });
        }
        await handle.close();
        handle = await open(file, 'r');
      }
    } else {
      file = await publicFilePath(root, parts);
      handle = await open(file, 'r');
    }
    info = await handle.stat();
  } catch {
    await handle?.close();
    return reply.status(404).send({ isError: true, message: 'File not found' });
  }
  try {
    if (!info.isFile()) {
      return await reply.status(404).send({ isError: true, message: 'File not found' });
    }
    if (contentType === 'application/vnd.apple.mpegurl') {
      const head = Buffer.alloc(Math.min(info.size, 8192));
      await handle.read(head, 0, head.length, 0);
      const master = head.includes(Buffer.from('#EXT-X-STREAM-INF:'));
      const liveMaster =
        master &&
        (head.includes(Buffer.from('/dynamic/')) || head.includes(Buffer.from('#MOARTUBE-LIVE')));
      const tail = Buffer.alloc(Math.min(info.size, 4096));
      await handle.read(tail, 0, tail.length, Math.max(0, info.size - tail.length));
      const ended = tail.toString('utf8').split(/\r?\n/).includes('#EXT-X-ENDLIST');
      const header = head.toString('utf8');
      // Inspect bytes as well as route type so active playlists cannot acquire VOD freshness.
      options = {
        ...options,
        live: options.live === true || (master ? liveMaster : !ended),
      };
      // Microcache complete live snapshots, never an empty startup file or terminal response.
      // Browsers revalidate every reload; shared caches may reuse a snapshot for one second.
      if (options.live && isActiveLivePlaylist(header, tail.toString('utf8'))) {
        reply.header('Cache-Control', livePlaylistCacheControl);
      }
    }
    // Nanosecond inode/publication metadata changes on atomic replacement even
    // when a copier preserves size and mtime. Mutable identities remain weak:
    // they must never authorize joining bytes from separate representations.
    const identity = fstatSync(handle.fd, { bigint: true });
    const immutable = immutableAsset;
    const etag = immutable
      ? `${/^(?:text\/|application\/javascript|image\/svg)/.test(contentType) ? 'W/' : ''}"${version}"`
      : `W/"${createHash('sha256').update([identity.dev, identity.ino, identity.size, identity.mtimeNs, identity.ctimeNs, identity.birthtimeNs].join(':')).digest('hex')}"`;
    const modified = info.mtime.toUTCString();
    reply.header('Content-Type', contentType).header('X-Content-Type-Options', 'nosniff');
    const text = /^(?:text\/|application\/javascript|image\/svg)/.test(contentType);
    if (text && info.size >= 1024) {
      varyEncoding(reply);
    }
    if (!options.live && !uncached) {
      reply
        .header(
          'Cache-Control',
          immutable
            ? 'public, max-age=31536000, s-maxage=31536000, immutable'
            : `public, max-age=0, s-maxage=${contentType.startsWith('video/') || contentType === 'application/vnd.apple.mpegurl' ? '31536000' : packaged ? '3600' : '30'}, must-revalidate`
        )
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
          : immutable &&
            request.headers['if-modified-since'] !== undefined &&
            Math.floor(info.mtimeMs / 1000) * 1000 <=
              Date.parse(request.headers['if-modified-since']);
      if (unchanged) {
        return await reply.status(304).send();
      }
    }
    let range: ByteRange | null | undefined;
    if (options.ranges) {
      reply.header('Accept-Ranges', 'bytes');
      const header = request.headers['if-range'];
      const ifRange = typeof header === 'string' ? header : undefined;
      const useRange =
        ifRange === undefined ||
        (!etag.startsWith('W/') && ifRange === etag) ||
        (immutable && Date.parse(ifRange) === Math.floor(info.mtimeMs / 1000) * 1000);
      if (request.method === 'GET' && useRange) {
        range = byteRange(request.headers.range, info.size);
      }
      if (range === null) {
        return await reply
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
      return await reply.send(Readable.from([]));
    }
    if (info.size === 0) {
      return await reply.send(Readable.from([]));
    }
    // Metadata and body must refer to the same inode. Bound a growing file to its snapshot size.
    const rawStream = handle.createReadStream(range ?? { start: 0, end: info.size - 1 });
    const stream = rawStream;
    handle = undefined; // The stream now owns and closes the descriptor.
    if (options.onBytes) {
      stream.once('close', () => options.onBytes?.(rawStream.bytesRead));
    }
    if (!compress) {
      return await reply.send(stream);
    }
    const compressed = createGzip();
    stream.on('error', (error: Error) => compressed.destroy(error));
    compressed.once('close', () => stream.destroy());
    return await reply.send(stream.pipe(compressed));
  } finally {
    await handle?.close();
  }
}
