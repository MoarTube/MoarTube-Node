import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { getConfig } from '@/config/index.js';
import { buildNodeBaseUrl } from '@/config/urls.js';
import type { NodeSettings } from '@/types/config.js';

type Config = ReturnType<typeof getConfig>;

/** Keep previous managed bases so partial migrations remain retryable after restart. No credentials. */
export function managedMediaBases(config: Config, remember = false): string[] {
  const current = [buildNodeBaseUrl(config.nodeSettings as NodeSettings)];
  try {
    current.push(config.getExternalVideosBaseUrl());
  } catch {
    // Legacy incomplete CDN/storage settings must remain repairable. History still
    // supplies known old origins; unknown absolute media references still fail closed.
  }
  const directory = config.paths.dataDirectoryPath;
  if (!directory) {
    return current;
  }
  const file = path.join(directory, '_media_url_origins.json');
  const saved: unknown = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(saved) || saved.some((value) => typeof value !== 'string')) {
    throw new Error('Invalid managed media URL history');
  }
  const values = [...new Set([...(saved as string[]), ...current].filter(Boolean))];
  for (const value of values) {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid managed media base');
    }
  }
  if (remember && JSON.stringify(saved) !== JSON.stringify(values)) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(values), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) {
        fs.unlinkSync(temporary);
      }
    }
  }
  return values;
}
