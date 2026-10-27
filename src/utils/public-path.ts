import path from 'node:path';
import { realpath } from 'node:fs/promises';

export function isPathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    value === value.trim() &&
    !value.endsWith('.') &&
    !/[\\/:]/.test(value) &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  );
}

export async function publicFilePath(root: string, parts: string[]): Promise<string> {
  if (!parts.every(isPathSegment)) {
    throw new Error('Invalid public path');
  }
  const [base, file] = await Promise.all([realpath(root), realpath(path.resolve(root, ...parts))]);
  const relative = path.relative(base, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Public path escapes its directory');
  }
  return file;
}
