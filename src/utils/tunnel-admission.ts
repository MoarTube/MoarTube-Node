import { withSettingsChange } from './settings-change.js';
import { tunnelSettingsIdentity } from '@/config/cloudflare-tunnel.js';
import type { TunnelSettings, TunnelConnector } from '@/types/cloudflare-tunnel.js';

export interface TunnelSettingsAccess {
  paths: { nodeSettingsPath: string };
  readonly nodeSettings: TunnelSettings;
  reloadNodeSettings(strict?: boolean): void;
}

/** Read desired state and spawn in one writer admission, closing the cross-worker disable race. */
export function admitTunnelLaunch(
  config: TunnelSettingsAccess,
  expected: TunnelSettings,
  launch: () => TunnelConnector
): Promise<TunnelConnector> {
  return withSettingsChange(config.paths.nodeSettingsPath, () => {
    config.reloadNodeSettings(true);
    if (
      config.nodeSettings.isCloudflareTunnelEnabled === false ||
      tunnelSettingsIdentity(config.nodeSettings) !== tunnelSettingsIdentity(expected)
    ) {
      throw new Error('Tunnel launch was superseded');
    }
    return Promise.resolve(launch());
  });
}

/** Lock ordering: provider admission, then short settings writes. Never hold settings for IPC reconciliation. */
export function withTunnelAdmission<T>(
  settingsPath: string,
  operation: () => Promise<T>
): Promise<T> {
  return withSettingsChange(settingsPath + '.tunnel', operation);
}
