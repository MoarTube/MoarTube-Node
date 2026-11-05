import cluster from 'node:cluster';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@/config/index.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import { withTunnelAdmission, admitTunnelLaunch } from '@/utils/tunnel-admission.js';
import { Logger } from '@/utils/logger.js';
import { CloudflareTunnelManager } from './cloudflare-tunnel.js';
import { CloudflareTunnelApi, TunnelOwnershipStore } from './cloudflare-tunnel-api.js';
import { CloudflaredDriver } from './cloudflared.js';
import type { TunnelSnapshot, TunnelSettings, TunnelConnector } from '@/types/cloudflare-tunnel.js';

let manager: CloudflareTunnelManager | undefined;

/** Lazy: HTTP workers never construct a connector manager. */
export function primaryTunnelManager(): CloudflareTunnelManager {
  if (!cluster.isPrimary) {
    throw new Error('Only the primary process may own Cloudflare Tunnel');
  }
  if (manager !== undefined) {
    return manager;
  }
  const config = getConfig();
  const api = new CloudflareTunnelApi(
    new TunnelOwnershipStore(
      path.join(config.paths.dataDirectoryPath, '_cloudflare_tunnel_private.json')
    )
  );
  manager = new CloudflareTunnelManager({
    withAdmission: (operation): Promise<void> =>
      withTunnelAdmission(config.paths.nodeSettingsPath, operation),
    launchIfCurrent: (expected, launch): Promise<TunnelConnector> =>
      admitTunnelLaunch(config, expected, launch),
    settings: (): TunnelSettings => {
      config.reloadNodeSettings(true);
      return config.nodeSettings;
    },
    saveQuickName: async (name, expected): Promise<void> => {
      await withSettingsChange(config.paths.nodeSettingsPath, () => {
        config.reloadNodeSettings(true);
        const current = config.nodeSettings;
        if (
          !current.isCloudflareTunnelEnabled ||
          current.isCloudflareCdnEnabled ||
          String(current.nodeListeningPort) !== String(expected.nodeListeningPort)
        ) {
          throw new Error('Settings changed during quick tunnel creation');
        }
        config.updateNodeSettings({ cloudflareTunnelName: name });
        return Promise.resolve();
      });
    },
    provision: (settings, origin, signal): Promise<{ token: string; publicUrl: string }> =>
      api.provision(settings, origin, signal),
    restoreRoutes: (settings, signal): Promise<void> => api.restoreRoutes(settings, signal),
    driver: new CloudflaredDriver(),
    report: (message): void => {
      Logger.getInstance().warn(message);
    },
  });
  return manager;
}

/** Correlated primary requests for future settings mutations; no secrets cross IPC. */
export function requestTunnelOperation(
  operation: 'reconcile' | 'restart' | 'snapshot' | 'prepare_cdn_clear' = 'reconcile'
): Promise<TunnelSnapshot> {
  if (cluster.isPrimary) {
    const tunnel = primaryTunnelManager();
    return operation === 'snapshot'
      ? Promise.resolve(tunnel.snapshot())
      : operation === 'prepare_cdn_clear'
        ? tunnel.prepareCdnClear()
        : tunnel[operation]();
  }
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const cleanup = (): void => {
      clearTimeout(timer);
      process.off('message', listener);
    };
    const listener = (message: unknown): void => {
      if (typeof message !== 'object' || message === null) {
        return;
      }
      const response = message as {
        cmd?: string;
        requestId?: string;
        tunnel?: TunnelSnapshot;
        error?: string;
      };
      if (
        response.cmd === 'cloudflare_tunnel_response' &&
        response.requestId === requestId &&
        response.tunnel !== undefined
      ) {
        cleanup();
        if (response.error !== undefined) {
          reject(new Error('Cloudflare Tunnel operation failed.'));
        } else {
          resolve(response.tunnel);
        }
      }
    };
    const timer = setTimeout(
      () => {
        cleanup();
        reject(new Error('Cloudflare Tunnel request timed out'));
      },
      operation === 'snapshot' ? 2000 : 120_000
    );
    process.on('message', listener);
    if (process.send === undefined) {
      cleanup();
      reject(new Error('Primary process is unavailable'));
      return;
    }
    try {
      process.send(
        { cmd: 'cloudflare_tunnel_request', requestId, operation },
        (error: Error | null) => {
          if (error !== null) {
            cleanup();
            reject(new Error('Primary process is unavailable'));
          }
        }
      );
    } catch {
      cleanup();
      reject(new Error('Primary process is unavailable'));
    }
  });
}
