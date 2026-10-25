// Keep the server's source URLs intact, including signed query strings.
export function sourceSelection(source) {
  const parts = new URL(source.src, 'https://localhost').pathname.split('/');
  const file = parts.at(-1);
  if (/\.m3u8$/i.test(file)) {
    return { format: 'm3u8', resolution: file.replace(/^manifest-/, '').replace(/\.m3u8$/i, '').replace(/^master$/, 'auto') };
  }
  return { format: parts.at(-2), resolution: file.replace(/\.[^.]+$/, '') };
}

export function supportedSources(adaptive, progressive, video) {
  return [...adaptive, ...progressive.filter(source => video.canPlayType(source.type))];
}

export function restoredTime(time, duration, seekable, live) {
  if (!Number.isFinite(time) || time < 0) return null;
  if (live && seekable.length) {
    return Math.max(seekable.start(0), Math.min(time, seekable.end(seekable.length - 1)));
  }
  return Number.isFinite(duration) ? Math.min(time, Math.max(0, duration - 0.01)) : time;
}
