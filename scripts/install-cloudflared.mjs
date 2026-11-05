import { createHash } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { release, assets } from './cloudflared-release.mjs';

// Official release asset digests, retrieved from cloudflare/cloudflared on 2026-11-04.
export { release };
export const checksums = {
  amd64: assets['linux-x64'].sha256,
  arm64: assets['linux-arm64'].sha256,
};

export async function downloadAsset(name, checksum, fetchAsset = fetch) {
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${release}/${name}`;
  const response = await fetchAsset(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error('cloudflared download failed');
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== checksum)
    throw new Error('cloudflared checksum mismatch');
  return data;
}

export async function install(architecture, destination, fetchAsset = fetch) {
  const checksum = checksums[architecture];
  if (!checksum) throw new Error('Unsupported cloudflared architecture');
  const data = await downloadAsset(`cloudflared-linux-${architecture}`, checksum, fetchAsset);
  await writeFile(destination, data, { mode: 0o755 });
  await chmod(destination, 0o755);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await install(process.argv[2], process.argv[3]);
}
