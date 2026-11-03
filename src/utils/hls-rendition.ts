/** Remove a variant's descriptor and URI together, retaining other master entries. */
export function withoutRendition(resolution: string): (line: string) => string {
  let descriptor = '';
  const matches = (line: string) =>
    new RegExp('(?:^|/)manifest-' + resolution + '\\.m3u8(?:[?&#"].*)?$').test(line.trim());
  return (line) => {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      descriptor = line;
      return '';
    }
    if (descriptor) {
      if (line.trim() === '' || line.startsWith('#')) {
        descriptor += '\n' + line;
        return '';
      }
      const previous = descriptor;
      descriptor = '';
      return matches(line) ? '' : previous + '\n' + line;
    }
    if (
      line.startsWith('#EXT-X-I-FRAME-STREAM-INF:') &&
      line.includes('manifest-' + resolution + '.m3u8')
    ) {
      return '';
    }
    return line;
  };
}
