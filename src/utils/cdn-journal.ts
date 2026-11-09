import { readRecovery, writeRecovery } from '@/database/recovery.js';
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

export async function readCdnJournal(settingsPath: string): Promise<CdnJournal> {
  try {
    const value = await readRecovery(settingsPath, 'cdn');
    if (value === undefined) {
      return { version: 1, current: null, originals: {} };
    }
    return journal.parse(JSON.parse(value));
  } catch (cause) {
    throw new Error(
      'CDN recovery state could not be read. Repair the recovery journal before changing distribution settings.',
      { cause }
    );
  }
}
export async function writeCdnJournal(settingsPath: string, value: CdnJournal): Promise<void> {
  await writeRecovery(settingsPath, 'cdn', JSON.stringify(journal.parse(value)));
}
export async function cdnStatus(
  settingsPath: string
): Promise<{ id: string; targetEnabled: boolean; stage: string } | null> {
  const current = (await readCdnJournal(settingsPath)).current;
  return current
    ? { id: current.id, targetEnabled: current.targetEnabled, stage: current.stage }
    : null;
}
export async function hasPendingCdn(settingsPath: string): Promise<boolean> {
  const current = (await readCdnJournal(settingsPath)).current;
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
export async function rewindCdnAfterRestart(settingsPath: string): Promise<void> {
  const state = await readCdnJournal(settingsPath);
  if (state.current?.stage === 'purge' || state.current?.stage === 'tunnel') {
    state.current.stage = 'media';
    await writeCdnJournal(settingsPath, state);
  }
}
