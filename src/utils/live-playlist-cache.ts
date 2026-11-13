import { open } from 'node:fs/promises';

export const livePlaylistCacheControl = 'public, max-age=0, s-maxage=1, must-revalidate';
export const livePlaylistMetadataKey = 'moartube-live-playlist';

/** Inspect bounded head/tail snapshots, including the lifecycle marker on live masters. */
export function isActiveLivePlaylist(head: string, tail = head): boolean {
  if (
    !/^#EXTM3U\r?\n/.test(head) ||
    /(?:^|\n)#EXT-X-ENDLIST\s*(?:\n|$)/.test(tail) ||
    /(?:^|\n)#EXT-X-PLAYLIST-TYPE:VOD\r?(?:\n|$)/.test(head)
  ) {
    return false;
  }
  if (head.includes('#EXT-X-STREAM-INF:')) {
    return (
      (head.includes('/dynamic/') || head.includes('#MOARTUBE-LIVE')) &&
      /(?:^|\n)[^#\s][^\r\n]*\.m3u8(?:[?#][^\r\n]*)?\r?(?:\n|$)/.test(head)
    );
  }
  const target = /^#EXT-X-TARGETDURATION:(\d+)\r?$/m.exec(head);
  const duration = /^#EXTINF:([\d.]+),[^\r\n]*\r?\n[^#\s][^\r\n]*\r?(?:\n|$)/m.exec(head);
  return (
    target !== null &&
    Number.isSafeInteger(Number(target[1])) &&
    Number(target[1]) > 0 &&
    duration !== null &&
    Number.isFinite(Number(duration[1])) &&
    Number(duration[1]) > 0 &&
    Math.round(Number(duration[1])) <= Number(target[1])
  );
}

/** An absent marker always means unknown/uncacheable to the managed CDN rules. */
export function livePlaylistCacheHeaders(active: boolean): {
  CacheControl: string;
  Metadata: Record<string, string>;
} {
  return {
    CacheControl: active ? livePlaylistCacheControl : 'no-store',
    Metadata: active ? { [livePlaylistMetadataKey]: 'active' } : {},
  };
}

/** Read a bounded snapshot, including the terminal marker on large recorded playlists. */
export async function isActiveLivePlaylistFile(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(Math.min(size, 8192));
    const tail = Buffer.alloc(Math.min(size, 4096));
    await handle.read(head, 0, head.length, 0);
    await handle.read(tail, 0, tail.length, Math.max(0, size - tail.length));
    return isActiveLivePlaylist(head.toString('utf8'), tail.toString('utf8'));
  } finally {
    await handle.close();
  }
}
