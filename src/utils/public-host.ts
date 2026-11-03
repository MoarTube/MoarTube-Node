import { isIP } from 'node:net';

export function isValidPublicHost(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) {
      return false;
    }
  }
  const host = value.trim();
  if (host.startsWith('[') && host.endsWith(']')) {
    return isIP(host.slice(1, -1)) === 6;
  }
  if (isIP(host)) {
    return true;
  }
  return (
    host.length > 0 &&
    host.length <= 253 &&
    !/^[\d.]+$/.test(host) &&
    host
      .replace(/\.$/, '')
      .split('.')
      .every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  );
}
