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
