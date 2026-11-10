import { createHash } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  utimesSync,
  rmdirSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getConfig } from '@/config/index.js';
import { acquireFileLock } from '@/utils/file-lock.js';

export const ASSET_RETENTION_LIMITS = Object.freeze({
  maxBytes: 512 * 1024 * 1024,
  maxFiles: 4096,
  maxAgeMs: 7 * 86400000,
});
class AssetCacheUnavailable extends Error {}
const assetRoot = (): string => path.join(getConfig().paths.dataDirectoryPath, 'cache', 'assets');

/** Only enumerate our flat hash/category/file layout; never follow symlinks. */
function retainedFiles(root: string): Array<{ file: string; size: number; used: number }> {
  const files: Array<{ file: string; size: number; used: number }> = [];
  for (const version of readdirSync(root, { withFileTypes: true })) {
    if (!version.isDirectory() || !/^[a-f0-9]{64}$/.test(version.name)) {
      continue;
    }
    for (const category of readdirSync(path.join(root, version.name), { withFileTypes: true })) {
      if (!category.isDirectory() || !['javascript', 'css', 'fonts'].includes(category.name)) {
        continue;
      }
      for (const entry of readdirSync(path.join(root, version.name, category.name), {
        withFileTypes: true,
      })) {
        if (!entry.isFile()) {
          continue;
        }
        const file = path.join(root, version.name, category.name, entry.name);
        const info = statSync(file);
        files.push({ file, size: info.size, used: info.mtimeMs });
      }
    }
  }
  return files;
}

/** Scheduled maintenance preserves assets advertised during the last seven days. */
export function pruneRetainedAssets(now = Date.now()): { bytes: number; files: number } {
  const root = assetRoot();
  mkdirSync(root, { recursive: true });
  const release = acquireFileLock(root);
  try {
    let bytes = 0,
      files = 0;
    for (const entry of retainedFiles(root)) {
      if (entry.used < now - ASSET_RETENTION_LIMITS.maxAgeMs) {
        rmSync(entry.file);
        // Empty hash/category directories are expendable; never remove recursively.
        for (const directory of [
          path.dirname(entry.file),
          path.dirname(path.dirname(entry.file)),
        ]) {
          try {
            rmdirSync(directory);
          } catch {
            /* Still in use. */
          }
        }
      } else {
        bytes += entry.size;
        files++;
      }
    }
    // Failed/crashed publications can leave empty directories with no file to age.
    for (const version of readdirSync(root, { withFileTypes: true })) {
      if (!version.isDirectory() || !/^[a-f0-9]{64}$/.test(version.name)) {
        continue;
      }
      const directory = path.join(root, version.name);
      for (const category of ['javascript', 'css', 'fonts']) {
        try {
          rmdirSync(path.join(directory, category));
        } catch {
          /* Nonempty or absent. */
        }
      }
      try {
        rmdirSync(directory);
      } catch {
        /* Still in use. */
      }
    }
    return { bytes, files };
  } finally {
    release();
  }
}

const publications = new Map<string, { identity: string; version: string }>();
function publicationIdentity(descriptor: number): { stamp: string; size: number; changed: number } {
  const info = fstatSync(descriptor, { bigint: true });
  return {
    stamp: [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.birthtimeNs].join(':'),
    size: Number(info.size),
    changed: Number(info.ctimeNs / 1_000_000n),
  };
}

function snapshot(descriptor: number, before = publicationIdentity(descriptor)): Buffer {
  const bytes = Buffer.alloc(before.size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) {
      throw new Error('Asset changed while being published');
    }
    offset += count;
  }
  if (publicationIdentity(descriptor).stamp !== before.stamp) {
    throw new Error('Asset changed while being published');
  }
  return bytes;
}

export function retainedAssetPath(parts: string[], version: string): string {
  // Runtime assets live outside dist/public, which is replaced by each build.
  return path.join(getConfig().paths.dataDirectoryPath, 'cache', 'assets', version, ...parts);
}

export function assetVersion(file: string, descriptor?: number): string {
  const opened = descriptor ?? openSync(file, 'r');
  try {
    return createHash('sha256').update(snapshot(opened)).digest('hex');
  } finally {
    if (descriptor === undefined) {
      closeSync(opened);
    }
  }
}

/** Persist complete hash-addressed bytes before any HTML advertises their URL. */
export function retainAsset(
  file: string,
  parts: string[],
  descriptor?: number,
  limits: Pick<typeof ASSET_RETENTION_LIMITS, 'maxBytes'> & {
    maxFiles?: number;
  } = ASSET_RETENTION_LIMITS
): string {
  const opened = descriptor ?? openSync(file, 'r');
  try {
    const identity = publicationIdentity(opened);
    const key = path.resolve(file);
    const cached = publications.get(key);
    // Some filesystems expose coarse change times even through nanosecond stats.
    // Re-read newly edited files until that timestamp's ambiguity window passes.
    if (
      cached?.identity === identity.stamp &&
      Date.now() - identity.changed >= 1000 &&
      existsSync(retainedAssetPath(parts, cached.version)) &&
      Date.now() - statSync(retainedAssetPath(parts, cached.version)).mtimeMs < 3600000
    ) {
      publications.delete(key);
      publications.set(key, cached);
      return cached.version;
    }
    const bytes = snapshot(opened, identity);
    const version = createHash('sha256').update(bytes).digest('hex');
    const destination = retainedAssetPath(parts, version);
    const remember = (): void => {
      publications.delete(key);
      publications.set(key, { identity: identity.stamp, version });
      while (publications.size > 512) {
        const oldest = publications.keys().next().value;
        publications.delete(oldest as string);
      }
    };
    const root = assetRoot();
    mkdirSync(root, { recursive: true });
    let release: () => void;
    try {
      release = acquireFileLock(root);
    } catch {
      throw new AssetCacheUnavailable('Asset publication is busy');
    }
    try {
      if (existsSync(destination)) {
        const now = new Date();
        utimesSync(destination, now, now);
        remember();
        return version;
      }
      const retained = retainedFiles(root);
      const used = retained.reduce((sum, entry) => sum + entry.size, 0);
      if (
        used + bytes.length > limits.maxBytes ||
        retained.length >= (limits.maxFiles ?? ASSET_RETENTION_LIMITS.maxFiles)
      ) {
        throw new AssetCacheUnavailable('Retained asset byte budget or file budget is full');
      }
      mkdirSync(path.dirname(destination), { recursive: true });
      const temporary = destination + '.' + randomUUID() + '.part';
      try {
        writeFileSync(temporary, bytes, { flag: 'wx' });
        renameSync(temporary, destination);
      } finally {
        rmSync(temporary, { force: true });
      }
    } finally {
      release();
    }
    remember();
    return version;
  } finally {
    if (descriptor === undefined) {
      closeSync(opened);
    }
  }
}

/** Only packaged code/fonts get immutable URLs; mutable node and video images do not. */
export function assetUrl(url: string): string {
  const clean = url.replace(/\?[\s\S]*$/, '');
  const match = /^\/external\/resources\/(javascript|css|fonts)\/([\w.-]+)$/.exec(clean);
  if (!match) {
    return url;
  }
  try {
    const file = path.join(
      getConfig().paths.publicDirectoryPath,
      String(match[1]),
      String(match[2])
    );
    return `${clean}?v=${retainAsset(file, [String(match[1]), String(match[2])])}`;
  } catch (error) {
    if (
      error instanceof AssetCacheUnavailable ||
      ['ENOSPC', 'EDQUOT'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      // Keep pages usable without advertising an immutable URL we cannot retain.
      return `${clean}?cache=off`;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return clean;
    }
    throw error;
  }
}
