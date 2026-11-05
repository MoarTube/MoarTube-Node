import { readFile, mkdir, mkdtemp, writeFile, chmod, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assets, release } from './cloudflared-release.mjs';
import { downloadAsset } from './install-cloudflared.mjs';
import { unpackDarwin } from './cloudflared-archive.mjs';

const digest = (data) => createHash('sha256').update(data).digest('hex');

export async function installHost({
  platform = process.platform,
  architecture = process.arch,
  destination = fileURLToPath(new URL('../resources/cloudflared/', import.meta.url)),
  fetchAsset = fetch,
  assetMap = assets,
} = {}) {
  const target = `${platform}-${architecture}`;
  const asset = Object.hasOwn(assetMap, target) ? assetMap[target] : undefined;
  if (!asset) throw new Error(`Unsupported cloudflared platform: ${target}`);
  const expected = asset.binarySha256 ?? asset.sha256;
  const directory = path.resolve(destination, target);
  const executable = path.join(directory, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  try {
    if (digest(await readFile(executable)) === expected) {
      if (platform !== 'win32') await chmod(executable, 0o755);
      return { executable, downloaded: false };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const downloaded = await downloadAsset(asset.name, asset.sha256, fetchAsset);
  const binary = asset.name.endsWith('.tgz') ? unpackDarwin(downloaded) : downloaded;
  if (digest(binary) !== expected) throw new Error('cloudflared executable checksum mismatch');
  await mkdir(directory, { recursive: true });
  // Stage on the destination filesystem; interrupted or rejected downloads never replace a binary.
  const temporary = await mkdtemp(path.join(directory, '.install-'));
  try {
    const staged = path.join(temporary, 'cloudflared');
    await writeFile(staged, binary, { mode: 0o755 });
    if (platform !== 'win32') await chmod(staged, 0o755);
    await rename(staged, executable);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { executable, downloaded: true };
}

export async function runInstaller({
  optional = false,
  env = process.env,
  install = installHost,
  log = console.log,
  warn = console.warn,
} = {}) {
  if (
    optional &&
    (env.MOARTUBE_SKIP_CLOUDFLARED_INSTALL === '1' || env.MOARTUBE_CLOUDFLARED_PATH)
  ) {
    log('Skipping automatic cloudflared installation (explicit override).');
    return true;
  }
  try {
    const result = await install();
    log(
      `cloudflared ${release}: ${result.downloaded ? 'installed' : 'already verified'} for ${process.platform}-${process.arch}.`
    );
    return true;
  } catch (error) {
    if (!optional) throw error;
    warn(
      'MoarTube Node: cloudflared could not be installed. Local Node access remains available. Retry with npm run install:cloudflared --prefix <installed-package-directory>, or set MOARTUBE_CLOUDFLARED_PATH to an installed executable.'
    );
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runInstaller({ optional: process.argv.includes('--optional') });
  } catch (error) {
    console.error(
      `cloudflared installation failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    process.exitCode = 1;
  }
}
