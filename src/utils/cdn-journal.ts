import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PublicNodeAddress } from '@/types/config.js';

const credentials = z.object({ email: z.string(), zone: z.string(), key: z.string() });
const address = z.object({
  publicNodeProtocol: z.enum(['http', 'https', '']),
  publicNodeAddress: z.string(),
  publicNodePort: z.union([z.string(), z.number()]),
});
export const providerSnapshotSchema = z.object({
  settings: z.array(
    z.object({
      endpoint: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
  ),
  rules: z.array(z.record(z.string(), z.unknown())).nullable(),
});
const original = z.object({
  credentials,
  before: providerSnapshotSchema,
  applied: providerSnapshotSchema,
});
const transition = z.object({
  id: z.uuid(),
  targetEnabled: z.boolean(),
  stage: z.enum(['provider', 'settings', 'media', 'purge', 'tunnel', 'complete']),
  target: credentials.nullable(),
  source: credentials.nullable(),
  publicAddress: address,
  originalAddress: address,
  tunnelName: z.string(),
  storageIdentity: z.string(),
});
const journal = z.object({
  version: z.literal(1),
  current: transition.nullable(),
  originals: z.record(z.string(), original),
});
export type ProviderSnapshot = z.infer<typeof providerSnapshotSchema>;
export type CdnTransition = z.infer<typeof transition>;
export type CdnJournal = z.infer<typeof journal>;
export type CdnCredentials = z.infer<typeof credentials>;

export function readCdnJournal(settingsPath: string): CdnJournal {
  const file = settingsPath + '.cdn-private.json';
  try {
    return journal.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, current: null, originals: {} };
    }
    throw new Error(
      'CDN recovery state could not be read. Repair the recovery journal before changing distribution settings.',
      { cause: error }
    );
  }
}
export function writeCdnJournal(settingsPath: string, value: CdnJournal): void {
  const validated = journal.parse(value);
  const file = settingsPath + '.cdn-private.json';
  const temporary = file + '.' + randomUUID() + '.part';
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(validated));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
export function cdnStatus(
  settingsPath: string
): { id: string; targetEnabled: boolean; stage: string } | null {
  const current = readCdnJournal(settingsPath).current;
  return current
    ? { id: current.id, targetEnabled: current.targetEnabled, stage: current.stage }
    : null;
}
export function hasPendingCdn(settingsPath: string): boolean {
  const current = readCdnJournal(settingsPath).current;
  return current !== null && current.stage !== 'complete';
}
export function publicAddressOf(value: PublicNodeAddress): PublicNodeAddress {
  return {
    publicNodeProtocol: value.publicNodeProtocol,
    publicNodeAddress: value.publicNodeAddress,
    publicNodePort: value.publicNodePort,
  };
}

/** Startup can finalize recorded media; repeat media migration and its final purge afterward. */
export function rewindCdnAfterRestart(settingsPath: string): void {
  const state = readCdnJournal(settingsPath);
  if (state.current?.stage === 'purge' || state.current?.stage === 'tunnel') {
    state.current.stage = 'media';
    writeCdnJournal(settingsPath, state);
  }
}
