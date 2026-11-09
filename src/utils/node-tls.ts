import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ServerOptions } from 'node:https';
import { getConfig } from '@config/index.js';

/** Load uploaded certificates on startup and on each server restart. */
export function nodeTlsOptions(): ServerOptions | null {
  const config = getConfig();
  if (!config.nodeSettings.isSecure) {
    return null;
  }

  const directory = config.paths.certificatesDirectoryPath;
  const ca = readdirSync(directory)
    .filter((name) => /^ca_\d+\.pem$/.test(name))
    .sort()
    .map((name) => readFileSync(path.join(directory, name)));

  return {
    key: readFileSync(path.join(directory, 'private_key.pem')),
    cert: readFileSync(path.join(directory, 'certificate.pem')),
    ...(ca.length ? { ca } : {}),
  };
}
