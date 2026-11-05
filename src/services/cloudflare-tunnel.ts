import {
  automaticCloudflareTunnelMode,
  quickTunnelNameFromUrl,
  tunnelSettingsIdentity,
} from '@/config/cloudflare-tunnel.js';
import type {
  TunnelConnector,
  TunnelDriver,
  TunnelSettings,
  TunnelSnapshot,
} from '@/types/cloudflare-tunnel.js';
import { TunnelRecoveryRequiredError } from '@/utils/tunnel-errors.js';

export interface TunnelDependencies {
  withAdmission?(operation: () => Promise<void>): Promise<void>;
  launchIfCurrent?(
    settings: TunnelSettings,
    launch: () => TunnelConnector
  ): Promise<TunnelConnector>;
  restoreRoutes?(settings: TunnelSettings, signal: AbortSignal): Promise<void>;
  settings(): TunnelSettings;
  saveQuickName(name: string, expected: TunnelSettings): Promise<void>;
  provision(
    settings: TunnelSettings,
    origin: string,
    signal: AbortSignal
  ): Promise<{ token: string; publicUrl: string }>;
  driver: TunnelDriver;
  report(message: string): void;
  retryDelays?: number[];
}

/** Owned by the primary process. No raw provider/process error is exposed to clients or logs. */
export class CloudflareTunnelManager {
  private state: TunnelSnapshot = { mode: 'none', status: 'stopped', name: '' };
  private connector: TunnelConnector | undefined;
  private stoppingConnector: TunnelConnector | undefined;
  private fingerprint: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private pending: AbortController | undefined;
  private retry: NodeJS.Timeout | undefined;
  private attempts = 0;
  private closed = false;
  private generation = 0;
  private request: { key: string; promise: Promise<TunnelSnapshot> } | undefined;

  constructor(private readonly dependencies: TunnelDependencies) {}

  snapshot(): TunnelSnapshot {
    return { ...this.state };
  }

  start(): Promise<TunnelSnapshot> {
    return this.reconcile();
  }

  restart(): Promise<TunnelSnapshot> {
    return this.reconcile(true);
  }

  /** Restore owned DNS while old CDN credentials still exist; do not stop the active connector. */
  prepareCdnClear(): Promise<TunnelSnapshot> {
    return this.serial(async () => {
      try {
        await this.dependencies.restoreRoutes?.(
          this.dependencies.settings(),
          AbortSignal.timeout(60_000)
        );
        return this.snapshot();
      } catch {
        throw new Error('Cloudflare Tunnel DNS routes could not be restored.');
      }
    });
  }

  reconcile(force = false): Promise<TunnelSnapshot> {
    return this.requestReconcile(force, false);
  }

  private requestReconcile(force: boolean, automatic: boolean): Promise<TunnelSnapshot> {
    let key: string;
    try {
      key = tunnelSettingsIdentity(this.dependencies.settings());
    } catch {
      ++this.generation;
      this.cancelRetry();
      this.pending?.abort();
      this.request = undefined;
      return this.serial(async () => {
        try {
          await this.stopConnector();
        } catch {
          /* Retain handle until cleanup succeeds. */
        }
        this.fail('Cloudflare Tunnel settings could not be read; startup is suspended.');
        this.scheduleRetry();
        return this.snapshot();
      });
    }
    if (!force && this.request?.key === key) {
      return this.request.promise;
    }
    if (!automatic) {
      this.attempts = 0;
    }
    const generation = ++this.generation;
    this.cancelRetry();
    // A newer request cancels a pending network/startup operation before joining the queue.
    this.pending?.abort();
    const promise = this.serial(async () => {
      if (this.closed || generation !== this.generation) {
        return this.snapshot();
      }
      try {
        const apply = async (): Promise<void> => {
          if (!this.closed && generation === this.generation) {
            await this.apply(force);
          }
        };
        // Disabling never needs provider admission; it must be able to terminate a child promptly.
        if (
          this.dependencies.settings().isCloudflareTunnelEnabled === false ||
          this.dependencies.withAdmission === undefined
        ) {
          await apply();
        } else {
          await this.dependencies.withAdmission(apply);
        }
      } catch (error) {
        const busy =
          error instanceof Error &&
          error.message === 'Another settings change or job admission is in progress.';
        if (!busy) {
          this.fail('Cloudflare Tunnel reconciliation admission failed.');
        }
        if (generation === this.generation) {
          this.scheduleRetry();
        }
      }
      return this.snapshot();
    });
    this.request = { key, promise };
    void promise
      .finally(() => {
        if (this.request?.promise === promise) {
          this.request = undefined;
        }
      })
      .catch(() => {});
    return promise;
  }

  stop(automatic = false): Promise<TunnelSnapshot> {
    if (!automatic) {
      this.attempts = 0;
    }
    ++this.generation;
    this.request = undefined;
    this.cancelRetry();
    this.pending?.abort();
    return this.serial(async () => {
      try {
        await this.stopConnector();
        this.state = { mode: 'none', status: 'stopped', name: '' };
      } catch {
        this.fail('Cloudflare Tunnel connector could not be stopped.');
        this.scheduleRetry(true);
      }
      return this.snapshot();
    });
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    const state = await this.stop();
    if (state.status === 'error') {
      throw new Error('Cloudflare Tunnel shutdown failed');
    }
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  private cancelRetry(): void {
    if (this.retry !== undefined) {
      clearTimeout(this.retry);
    }
    this.retry = undefined;
  }

  private fail(message: string): void {
    this.state = { ...this.state, status: 'error', message };
    this.dependencies.report(message);
  }

  private scheduleRetry(stopOnly = false): void {
    const delays = this.dependencies.retryDelays ?? [1000, 5000, 15000, 30000, 60000];
    const delay = delays[this.attempts++];
    if (this.closed || delay === undefined) {
      return;
    }
    this.cancelRetry();
    this.retry = setTimeout(() => {
      this.retry = undefined;
      // apply() re-reads committed settings; disabling can never be undone by a retry.
      void (stopOnly ? this.stop(true) : this.requestReconcile(false, true));
    }, delay);
    this.retry.unref();
  }

  private async stopConnector(): Promise<void> {
    const current = this.connector;
    if (current !== undefined) {
      // Retain the handle if stop fails; a second connector must never be launched.
      this.stoppingConnector = current;
      try {
        await current.stop();
      } finally {
        this.stoppingConnector = undefined;
      }
      // Serialized lifecycle work and the stoppingConnector exit guard keep this handle stable.
      this.connector = undefined;
    }
    this.fingerprint = undefined;
  }

  private identity(settings: TunnelSettings): string {
    return tunnelSettingsIdentity(settings);
  }

  private async apply(force: boolean): Promise<void> {
    const controller = new AbortController();
    this.pending = controller;
    let settings: TunnelSettings;
    try {
      settings = this.dependencies.settings();
      const savedName = (settings.cloudflareTunnelName ?? '').trim();
      const mode = automaticCloudflareTunnelMode(settings);
      if (settings.isCloudflareTunnelEnabled === false) {
        await this.stopConnector();
        this.state = { mode: 'none', status: 'stopped', name: '' };
        this.attempts = 0;
        return;
      }
      if (
        !force &&
        this.state.status === 'running' &&
        this.fingerprint === this.identity(settings)
      ) {
        return;
      }
      await this.stopConnector();
      this.state = { mode: mode === 'none' ? 'named' : mode, status: 'starting', name: '' };
      if (mode === 'none') {
        this.fail(
          'Cloudflare CDN is enabled but its tunnel name is missing. Configure CDN with a tunnel name.'
        );
        return;
      }
      const origin = `http://127.0.0.1:${String(settings.nodeListeningPort)}`;
      await this.dependencies.driver.verify();
      controller.signal.throwIfAborted();
      const named =
        mode === 'named'
          ? await this.dependencies.provision(
              settings,
              origin,
              AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)])
            )
          : undefined;
      controller.signal.throwIfAborted();
      // Provisioning can span settings changes in another worker.
      if (
        this.dependencies.settings().isCloudflareTunnelEnabled === false ||
        this.identity(this.dependencies.settings()) !== this.identity(settings)
      ) {
        throw new Error('Settings changed');
      }
      const launched: { connector?: TunnelConnector; exited: boolean } = { exited: false };
      const launch = (): TunnelConnector =>
        this.dependencies.driver.launch({
          mode,
          origin,
          token: named?.token,
          signal: controller.signal,
          onExit: () => {
            const current = launched.connector;
            if (current === undefined) {
              launched.exited = true;
              return;
            }
            if (this.connector !== current || this.stoppingConnector === current) {
              return;
            }
            const wasRunning = this.state.status === 'running';
            this.connector = undefined;
            this.fingerprint = undefined;
            this.state = { mode, status: 'error', name: '' };
            this.fail('Cloudflare Tunnel connector exited.');
            if (wasRunning) {
              this.scheduleRetry();
            }
          },
        });
      let connector: TunnelConnector;
      if (this.dependencies.launchIfCurrent === undefined) {
        connector = launch();
      } else {
        connector = await this.dependencies.launchIfCurrent(settings, launch);
      }
      launched.connector = connector;
      this.connector = connector;
      if (launched.exited) {
        throw new Error('Connector exited during launch admission');
      }
      const ready = await connector.ready;
      controller.signal.throwIfAborted();
      if (this.connector !== connector) {
        throw new Error('Connector exited during startup');
      }
      const name = mode === 'quick' ? quickTunnelNameFromUrl(ready.publicUrl ?? '') : savedName;
      if (mode === 'quick') {
        await this.dependencies.saveQuickName(name, settings);
      }
      controller.signal.throwIfAborted();
      const latest = this.dependencies.settings();
      if (this.connector !== connector) {
        throw new Error('Connector exited during persistence');
      }
      if (
        latest.isCloudflareTunnelEnabled === false ||
        this.identity(latest) !== this.identity(settings)
      ) {
        throw new Error('Settings changed');
      }
      this.state = {
        mode,
        status: 'running',
        name,
        publicUrl: named?.publicUrl ?? ready.publicUrl,
      };
      this.fingerprint = this.identity(settings);
      // Keep crash-loop retries bounded even if the connector briefly reaches readiness.
    } catch (error) {
      try {
        await this.stopConnector();
      } catch {
        this.fail(
          'Cloudflare Tunnel cleanup failed; no replacement connector will start until it stops.'
        );
        this.scheduleRetry();
        return;
      }
      this.fail(
        error instanceof TunnelRecoveryRequiredError
          ? 'Cloudflare Tunnel ownership could not be recorded or cleaned up. Repair storage and inspect the Cloudflare account before retrying.'
          : 'Cloudflare Tunnel could not start. Check cloudflared installation, network access, and saved CDN configuration.'
      );
      if (!controller.signal.aborted && !(error instanceof TunnelRecoveryRequiredError)) {
        this.scheduleRetry();
      }
    } finally {
      // apply() is serialized; a later controller cannot exist until this call finishes.
      this.pending = undefined;
    }
  }
}
