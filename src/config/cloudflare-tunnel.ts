import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { TunnelSettings } from '@/types/cloudflare-tunnel.js';

/** Stable desired-state key; includes credential repair without retaining raw keys in fingerprints. */
export function tunnelSettingsIdentity(settings: TunnelSettings): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        settings.isCloudflareTunnelEnabled !== false,
        settings.isCloudflareCdnEnabled,
        String(settings.nodeListeningPort),
        ...(settings.isCloudflareCdnEnabled
          ? [
              settings.cloudflareTunnelName?.trim(),
              settings.cloudflareZoneId,
              settings.publicNodeAddress.trim().toLowerCase().replace(/\.$/, ''),
              settings.storageConfig?.storageMode,
              settings.cloudflareEmailAddress,
              settings.cloudflareGlobalApiKey,
            ]
          : []),
      ])
    )
    .digest('hex');
}

/** Application name policy, shared by persisted settings and future save endpoints. */
export const cloudflareTunnelNameSchema = z
  .string()
  .trim()
  .max(100, 'Cloudflare Tunnel Name must be at most 100 characters')
  .refine(
    (value) =>
      Array.from(value).every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
      ),
    'Cloudflare Tunnel Name must not contain control characters'
  )
  .regex(/^[^/\\:?#]*$/u, 'Enter a tunnel name, not a URL or path');

export const cloudflareTunnelToggleBodySchema = z.object({
  isEnabled: z.boolean(),
});

/** Pure startup policy; disabled wins, while quick creation needs no existing name. */
export function automaticCloudflareTunnelMode(settings: {
  isCloudflareTunnelEnabled?: boolean;
  cloudflareTunnelName?: string | undefined;
  isCloudflareCdnEnabled: boolean;
}): 'none' | 'quick' | 'named' {
  if (settings.isCloudflareTunnelEnabled === false) {
    return 'none';
  }
  if (!settings.isCloudflareCdnEnabled) {
    return 'quick';
  }
  // Invalid legacy CDN configuration must not silently fall back to a quick tunnel.
  if ((settings.cloudflareTunnelName?.trim() ?? '') === '') {
    return 'none';
  }
  return 'named';
}

/** Quick tunnels expose a URL, not a named-tunnel resource; retain only its random label. */
export function quickTunnelNameFromUrl(value: string): string {
  const url = new URL(value);
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.trycloudflare\.com$/.exec(url.hostname);
  if (
    url.protocol !== 'https:' ||
    !match ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid Cloudflare quick tunnel URL');
  }
  return cloudflareTunnelNameSchema.parse(match[1]);
}
