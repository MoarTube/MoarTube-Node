import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareTunnelManager, type TunnelDependencies } from '@/services/cloudflare-tunnel.js';
import type { TunnelSettings, TunnelConnector } from '@/types/cloudflare-tunnel.js';

function setup(overrides: Partial<TunnelDependencies> = {}) {
  let settings: TunnelSettings = {
    isCloudflareTunnelEnabled: true,
    isCloudflareCdnEnabled: false,
    cloudflareEmailAddress: 'email',
    cloudflareZoneId: 'zone',
    cloudflareGlobalApiKey: 'private-key',
    publicNodeAddress: 'node.example.com',
    nodeListeningPort: 9090,
  };
  const connectors: TunnelConnector[] = [];
  const dependencies: TunnelDependencies = {
    settings: () => ({ ...settings }),
    saveQuickName: vi.fn(async (name) => {
      settings.cloudflareTunnelName = name;
    }),
    provision: vi.fn(async () => ({
      token: 'secret-token',
      publicUrl: 'https://node.example.com',
    })),
    report: vi.fn(),
    retryDelays: [],
    driver: {
      verify: vi.fn(async () => {}),
      launch: vi.fn(() => {
        const connector = {
          ready: Promise.resolve({ publicUrl: 'https://new-random-name.trycloudflare.com' }),
          stop: vi.fn(async () => {}),
        };
        connectors.push(connector);
        return connector;
      }),
    },
    ...overrides,
  };
  const manager = new CloudflareTunnelManager(dependencies);
  return {
    manager,
    dependencies,
    connectors,
    settings: (update: Partial<TunnelSettings>) => {
      settings = { ...settings, ...update };
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('primary Cloudflare Tunnel manager', () => {
  it('reports shutdown failure instead of claiming successful termination', async () => {
    const test = setup();
    await test.manager.start();
    vi.mocked(test.connectors[0]!.stop).mockRejectedValue(new Error('termination failed'));
    await expect(test.manager.shutdown()).rejects.toThrow('shutdown failed');
    expect(test.manager.snapshot().status).toBe('error');
  });

  it('does not report running if the connector exits during name persistence', async () => {
    const test = setup();
    vi.mocked(test.dependencies.saveQuickName).mockImplementation(async () => {
      vi.mocked(test.dependencies.driver.launch).mock.calls[0]![0].onExit();
    });
    expect((await test.manager.start()).status).toBe('error');
  });

  it('does nothing remotely when disabled, even with CDN enabled', async () => {
    const test = setup();
    test.settings({ isCloudflareTunnelEnabled: false, isCloudflareCdnEnabled: true });
    expect(await test.manager.start()).toMatchObject({ mode: 'none', status: 'stopped' });
    expect(test.dependencies.driver.verify).not.toHaveBeenCalled();
    expect(test.dependencies.provision).not.toHaveBeenCalled();
  });

  it('starts quick without a preexisting name and persists the generated replacement', async () => {
    const test = setup();
    expect(await test.manager.start()).toMatchObject({
      mode: 'quick',
      status: 'running',
      name: 'new-random-name',
    });
    expect(test.dependencies.saveQuickName).toHaveBeenCalledWith(
      'new-random-name',
      expect.any(Object)
    );
    expect(test.dependencies.driver.launch).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'http://127.0.0.1:9090', mode: 'quick' })
    );
    await test.manager.shutdown();
  });

  it('reconciles without duplicating, and restart stops the old connector first', async () => {
    const test = setup();
    await test.manager.start();
    await test.manager.reconcile();
    expect(test.dependencies.driver.launch).toHaveBeenCalledTimes(1);
    await test.manager.restart();
    expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();
    expect(test.dependencies.driver.launch).toHaveBeenCalledTimes(2);
    await test.manager.shutdown();
  });

  it('provisions named mode with saved credentials/name and keeps token out of snapshots', async () => {
    const test = setup();
    test.settings({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'My Named Tunnel' });
    const state = await test.manager.start();
    expect(state).toMatchObject({ mode: 'named', name: 'My Named Tunnel', status: 'running' });
    expect(JSON.stringify(state)).not.toContain('secret-token');
    expect(test.dependencies.driver.launch).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'secret-token', mode: 'named' })
    );
    expect(test.dependencies.saveQuickName).not.toHaveBeenCalled();
    await test.manager.shutdown();
  });

  it('reports missing named configuration without quick fallback or provisioning', async () => {
    const test = setup();
    test.settings({ isCloudflareCdnEnabled: true });
    expect(await test.manager.start()).toMatchObject({ status: 'error', mode: 'named' });
    expect(test.dependencies.provision).not.toHaveBeenCalled();
    expect(test.dependencies.driver.launch).not.toHaveBeenCalled();
  });

  it('stops the new connector if generated name persistence fails', async () => {
    const test = setup({
      saveQuickName: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    expect(await test.manager.start()).toMatchObject({ status: 'error' });
    expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();
  });

  it('sanitizes provider failures and never falls back from named to quick', async () => {
    const test = setup({
      provision: vi.fn(async () => {
        throw new Error('secret-token private-key');
      }),
    });
    test.settings({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'named' });
    const state = await test.manager.start();
    expect(state.status).toBe('error');
    expect(JSON.stringify(state)).not.toContain('private-key');
    expect(JSON.stringify(vi.mocked(test.dependencies.report).mock.calls)).not.toContain(
      'secret-token'
    );
    expect(test.dependencies.driver.launch).not.toHaveBeenCalled();
  });

  it('cannot start a replacement if cleanup fails', async () => {
    const test = setup();
    await test.manager.start();
    vi.mocked(test.connectors[0]!.stop).mockRejectedValue(new Error('cannot stop'));
    expect((await test.manager.restart()).status).toBe('error');
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
  });

  it('rechecks committed disable after provisioning before launching', async () => {
    const test = setup();
    test.settings({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'named' });
    vi.mocked(test.dependencies.provision).mockImplementation(async () => {
      test.settings({ isCloudflareTunnelEnabled: false });
      return { token: 'secret', publicUrl: 'https://node.example.com' };
    });
    expect((await test.manager.start()).status).toBe('error');
    expect(test.dependencies.driver.launch).not.toHaveBeenCalled();
    expect((await test.manager.reconcile()).status).toBe('stopped');
  });

  it('shuts down the active connector and rejects future automatic launches', async () => {
    const test = setup();
    await test.manager.start();
    await test.manager.shutdown();
    expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();
    await test.manager.start();
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
  });

  it('serializes concurrent operations and cancels a pending launch on shutdown', async () => {
    const test = setup();
    let release!: () => void;
    vi.mocked(test.dependencies.driver.verify).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const start = test.manager.start();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const stop = test.manager.shutdown();
    release();
    await Promise.all([start, stop]);
    expect(test.dependencies.driver.launch).not.toHaveBeenCalled();
    expect(test.manager.snapshot().status).toBe('stopped');
  });

  it('bounds crash retries and observes disable before retry', async () => {
    vi.useFakeTimers();
    const test = setup({ retryDelays: [10, 20] });
    await test.manager.start();
    const launch = vi.mocked(test.dependencies.driver.launch);
    launch.mock.calls[0]![0].onExit();
    test.settings({ isCloudflareTunnelEnabled: false });
    await vi.advanceTimersByTimeAsync(10);
    expect(test.manager.snapshot().status).toBe('stopped');
    expect(launch).toHaveBeenCalledOnce();
  });

  it('stops retrying startup failures after a bounded budget', async () => {
    vi.useFakeTimers();
    const test = setup({ retryDelays: [10, 20] });
    vi.mocked(test.dependencies.driver.verify).mockRejectedValue(new Error('missing binary'));
    await test.manager.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(test.dependencies.driver.verify).toHaveBeenCalledTimes(3);
    expect(test.manager.snapshot().status).toBe('error');
    await test.manager.shutdown();
  });
});
