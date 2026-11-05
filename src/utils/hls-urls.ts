import path from 'node:path';

/** Public layout is independent of the local encoder's flat manifest directory. */
export function hlsPlaylistPath(videoId: string, name: string, type = 'static'): string {
  return `/external/videos/${encodeURIComponent(videoId)}/adaptive/m3u8/${type}/manifests/${name}`;
}

/** Normalize only references belonging to this managed video. Signed/external URLs stay external. */
export function relativeHlsLine(
  line: string,
  playlistPath: string,
  managedBases: string[]
): string {
  const playlist = new URL(playlistPath, 'https://managed.invalid');
  const root = /^(.*\/external\/videos\/[^/]+\/adaptive\/m3u8\/)/.exec(playlist.pathname)?.[1];
  if (root === undefined) {
    throw new Error('Invalid managed playlist path');
  }
  const convert = (reference: string): string => {
    const raw = reference.trim();
    if (!raw || raw.includes('\\')) {
      return reference;
    }
    const absolute = /^(?:https?:)?\/\//i.test(raw);
    let target: URL;
    try {
      target = new URL(raw, playlist);
    } catch {
      return reference;
    }
    if (
      !/^https?:$/.test(target.protocol) ||
      target.search ||
      target.hash ||
      target.username ||
      target.password
    ) {
      return reference;
    }
    if (absolute) {
      const permitted = managedBases.some((base) => {
        try {
          return new URL(base).origin === target.origin;
        } catch {
          return false;
        }
      });
      if (!permitted) {
        if (target.pathname.includes(root)) {
          throw new Error('Unknown managed HLS origin; migration needs its previous media base');
        }
        return reference;
      }
    }
    // Strip an S3 path-style bucket prefix only when it is a known configured base.
    let targetPath = target.pathname;
    for (const base of managedBases) {
      try {
        const known = new URL(base);
        const prefix = known.pathname.replace(/\/$/, '');
        if (
          prefix &&
          (!absolute || known.origin === target.origin) &&
          targetPath.startsWith(prefix + '/external/')
        ) {
          targetPath = targetPath.slice(prefix.length);
        }
      } catch {
        /* Empty filesystem viewer base. */
      }
    }
    if (!targetPath.startsWith(root)) {
      if (targetPath.includes(root)) {
        throw new Error('Unknown managed HLS origin; migration needs its previous media base');
      }
      return reference;
    }
    const relative = path.posix.relative(path.posix.dirname(playlist.pathname), targetPath);
    return relative || path.posix.basename(targetPath);
  };
  if (line.startsWith('#')) {
    return line.replace(/\bURI="([^"]*)"/g, (_match, uri: string) => `URI="${convert(uri)}"`);
  }
  return line.trim() ? convert(line) : line;
}
