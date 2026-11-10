import { getConfig } from '@/config/index.js';

// Free supports request matching, but not arbitrary custom cache keys. Keep the
// cacheable mutable-media variants finite so exact purges can enumerate them.
export const mediaKeyHeaders = [
  'x-http-method-override',
  'x-http-method',
  'x-method-override',
  'x-forwarded-host',
  'x-host',
  'x-forwarded-scheme',
  'x-original-url',
  'x-rewrite-url',
  'forwarded',
] as const;

export function mediaCacheOrigins(baseUrl = getConfig().getNodeBaseUrl()): string[] {
  const base = new URL(baseUrl);
  return [...new Set([base.origin, new URL(base.href.replace(/^http:/, 'https:')).origin])];
}

export function cacheableMediaRequest(
  url: string,
  headers: Record<string, string | string[] | undefined>
): boolean {
  const parsed = new URL(url, 'https://origin.invalid');
  if (!parsed.pathname.startsWith('/external/videos/')) {
    return true;
  }
  if (url.includes('?') || mediaKeyHeaders.some((key) => headers[key] !== undefined)) {
    return false;
  }
  const origin = headers['origin'];
  return (
    origin === undefined || (typeof origin === 'string' && mediaCacheOrigins().includes(origin))
  );
}

export function mediaVariantBypass(baseUrl?: string): string {
  const origins = mediaCacheOrigins(baseUrl)
    .map((value) => JSON.stringify(value))
    .join(' ');
  const headers = mediaKeyHeaders.map((key) => `any(http.request.headers["${key}"][*] ne "")`);
  return (
    `(starts_with(http.request.uri.path, "/external/videos/")) and (` +
    `(http.request.uri contains "?") or (len(http.request.headers["origin"]) gt 1) or ` +
    `(any(http.request.headers["origin"][*] ne "") and not any(http.request.headers["origin"][*] in {${origins}})) or ` +
    headers.map((value) => `(${value})`).join(' or ') +
    ')'
  );
}

export function mediaPurgeTargets(urls: string[]): string[] {
  return urls.flatMap((value) => {
    if (!/^https?:\/\//.test(value)) {
      return [value];
    }
    const url = new URL(value);
    if (!url.pathname.startsWith('/external/videos/')) {
      return [value];
    }
    url.search = '';
    url.hash = '';
    return [
      url.href,
      ...mediaCacheOrigins().map(
        (origin) => 'file:' + JSON.stringify({ url: url.href, headers: { Origin: origin } })
      ),
    ];
  });
}

/** Browser freshness stays zero; shared caches keep recorded video for one year. */
export function mediaObjectCacheControl(key: string): string {
  if (key.includes('/dynamic/manifests/')) {
    return 'no-store';
  }
  const video =
    /\.(?:ts|mp4|webm|ogv)$/.test(key) ||
    (key.includes('/static/manifests/') && key.endsWith('.m3u8'));
  return video
    ? 'public, max-age=0, s-maxage=31536000, must-revalidate'
    : 'public, max-age=0, s-maxage=30, must-revalidate';
}
