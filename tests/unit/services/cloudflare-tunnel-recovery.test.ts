import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareTunnelManager, type TunnelDependencies } from '@/services/cloudflare-tunnel.js';
import type { TunnelSettings, TunnelConnector } from '@/types/cloudflare-tunnel.js';
import { TunnelRecoveryRequiredError } from '@/utils/tunnel-errors.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<TunnelDependencies> = {}) {
  let settings: TunnelSettings = {
    isCloudflareTunnelEnabled: true,
    isCloudflareCdnEnabled: false,
    cloudflareEmailAddress: 'email',
    cloudflareZoneId: 'zone',
    cloudflareGlobalApiKey: 'secret',
    publicNodeAddress: 'node.example.com',
    nodeListeningPort: 9090,
  };
  const connectors: TunnelConnector[] = [];
  let sequence = 0;
  const dependencies: TunnelDependencies = {
    settings: () => ({ ...settings }),
    saveQuickName: vi.fn(async (name) => {
      settings.cloudflareTunnelName = name;
    }),
    provision: vi.fn(async () => ({
      token: 'private-token',
      publicUrl: 'https://node.example.com',
    })),
    driver: {
      verify: vi.fn(async () => {}),
      launch: vi.fn(() => {
        const connector = {
          ready: Promise.resolve({ publicUrl: `https://random-${++sequence}.trycloudflare.com` }),
          stop: vi.fn(async () => {}),
        };
        connectors.push(connector);
        return connector;
      }),
    },
    report: vi.fn(),
    retryDelays: [10, 20],
    ...overrides,
  };
  return {
    manager: new CloudflareTunnelManager(dependencies),
    dependencies,
    connectors,
    update: (updates: Partial<TunnelSettings>) => {
      settings = { ...settings, ...updates };
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('tunnel reconciliation recovery', () => {
  it('starts successfully through atomic asynchronous launch admission',async()=>{
    const test=setup({launchIfCurrent:async(_settings,launch)=>launch()});
    expect((await test.manager.start()).status).toBe('running');await test.manager.shutdown();
  });
  it.each([{isCloudflareTunnelEnabled:false},{nodeListeningPort:9191}])('stops when committed settings change during generated-name persistence: %o',async changes=>{
    const test=setup({retryDelays:[]});vi.mocked(test.dependencies.saveQuickName).mockImplementation(async()=>{test.update(changes)});
    expect((await test.manager.start()).status).toBe('error');expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();await test.manager.shutdown();
  });
  it('uses the default bounded retry delay and stops retrying after an explicit stop',async()=>{
    vi.useFakeTimers();const test=setup({retryDelays:undefined});vi.mocked(test.dependencies.driver.verify).mockRejectedValue(new Error('missing executable'));
    expect((await test.manager.start()).status).toBe('error');await vi.advanceTimersByTimeAsync(1000);expect(test.dependencies.driver.verify).toHaveBeenCalledTimes(2);
    await test.manager.stop();await vi.advanceTimersByTimeAsync(120000);expect(test.dependencies.driver.verify).toHaveBeenCalledTimes(2);
  });
  it('discards a stale admitted callback after a newer stop, even when admission rejects with a non-Error',async()=>{
    const gate=deferred();let entered!:(()=>Promise<void>);
    const test=setup({withAdmission:async operation=>{entered=operation;await gate.promise;await operation();throw 'admission rejected';},retryDelays:[]});
    const old=test.manager.start();await vi.waitFor(()=>expect(entered).toBeTypeOf('function'));
    const stop=test.manager.stop();gate.resolve();await old;await stop;expect(test.dependencies.driver.launch).not.toHaveBeenCalled();await test.manager.shutdown();
  });
  it('serializes later requests after a reporter throws and does not leak a rejected finally promise',async()=>{
    const test=setup({withAdmission:async()=>{throw new Error('admission unavailable')},report:()=>{throw new Error('logger unavailable')},retryDelays:[]});
    await expect(test.manager.start()).rejects.toThrow('logger unavailable');
    test.dependencies.withAdmission=async operation=>operation();test.dependencies.report=vi.fn();
    expect((await test.manager.reconcile()).status).toBe('running');await test.manager.shutdown();
  });
  it('rejects startup if a connector exits while readiness is still pending',async()=>{
    const test=setup({retryDelays:[]});let finish!:(v:any)=>void;
    vi.mocked(test.dependencies.driver.launch).mockImplementation(()=>({ready:new Promise(resolve=>{finish=resolve}),stop:vi.fn(async()=>{})}));
    const startup=test.manager.start();await vi.waitFor(()=>expect(test.dependencies.driver.launch).toHaveBeenCalled());
    vi.mocked(test.dependencies.driver.launch).mock.calls[0]![0].onExit();finish({publicUrl:'https://gone.trycloudflare.com'});
    expect((await startup).status).toBe('error');expect(test.dependencies.saveQuickName).not.toHaveBeenCalled();await test.manager.shutdown();
  });
  it('rejects readiness without a generated quick URL',async()=>{
    const test=setup({retryDelays:[]});vi.mocked(test.dependencies.driver.launch).mockReturnValue({ready:Promise.resolve({}),stop:vi.fn(async()=>{})});
    expect((await test.manager.start()).status).toBe('error');expect(test.dependencies.saveQuickName).not.toHaveBeenCalled();await test.manager.shutdown();
  });
  it('handles an exit callback before atomic launch admission returns its handle', async () => {
    const test = setup();
    const stop = vi.fn(async () => {});
    vi.mocked(test.dependencies.driver.launch).mockImplementation((options) => {
      options.onExit();
      return {
        ready: Promise.resolve({ publicUrl: 'https://early-exit.trycloudflare.com' }),
        stop,
      };
    });
    expect((await test.manager.start()).status).toBe('error');
    expect(stop).toHaveBeenCalledOnce();
    expect(test.dependencies.saveQuickName).not.toHaveBeenCalled();
    await test.manager.shutdown();
  });
  it('does not restart when a stop operation itself emits an exit callback', async () => {
    vi.useFakeTimers();
    const test = setup();
    await test.manager.start();
    vi.mocked(test.connectors[0]!.stop).mockImplementation(async () => {
      vi.mocked(test.dependencies.driver.launch).mock.calls[0]![0].onExit();
    });
    await test.manager.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
    expect(test.manager.snapshot().status).toBe('stopped');
  });
  it('does not automatically repeat an untracked-resource cleanup failure', async () => {
    vi.useFakeTimers();
    const test = setup();
    test.update({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'named' });
    vi.mocked(test.dependencies.provision).mockRejectedValue(
      new TunnelRecoveryRequiredError('private provider details')
    );
    expect((await test.manager.start()).status).toBe('error');
    await vi.advanceTimersByTimeAsync(100);
    expect(test.dependencies.provision).toHaveBeenCalledOnce();
    expect(test.manager.snapshot().message).toMatch(/inspect the Cloudflare account/);
    await test.manager.shutdown();
  });
  it('coalesces duplicate pending starts instead of cancelling a healthy startup', async () => {
    const gate = deferred();
    const test = setup();
    vi.mocked(test.dependencies.driver.verify).mockReturnValue(gate.promise);
    const first = test.manager.start();
    const second = test.manager.reconcile();
    expect(second).toBe(first);
    gate.resolve();
    await Promise.all([first, second]);
    expect(test.dependencies.driver.verify).toHaveBeenCalledOnce();
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
    await test.manager.shutdown();
  });
  it('discards superseded queued starts before any executable or provider call', async () => {
    const test = setup();
    const first = test.manager.start();
    const restart = test.manager.restart();
    test.update({ isCloudflareTunnelEnabled: false });
    const disable = test.manager.reconcile();
    await Promise.all([first, restart, disable]);
    expect(test.dependencies.driver.verify).not.toHaveBeenCalled();
    expect(test.dependencies.provision).not.toHaveBeenCalled();
    expect(test.manager.snapshot().status).toBe('stopped');
  });
  it('observes a committed disable at atomic launch admission', async () => {
    const test = setup();
    test.dependencies.launchIfCurrent = vi.fn(async (_settings, _launch) => {
      test.update({ isCloudflareTunnelEnabled: false });
      throw new Error('superseded');
    });
    await test.manager.start();
    expect(test.dependencies.driver.launch).not.toHaveBeenCalled();
    await test.manager.reconcile();
    expect(test.manager.snapshot().status).toBe('stopped');
  });
  it('does not restart a healthy child when provider admission is busy and can retry later', async () => {
    vi.useFakeTimers();
    const test = setup();
    await test.manager.start();
    test.dependencies.withAdmission = vi.fn(async () => {
      throw new Error('Another settings change or job admission is in progress.');
    });
    expect((await test.manager.reconcile()).status).toBe('running');
    expect(test.connectors[0]!.stop).not.toHaveBeenCalled();
    test.dependencies.withAdmission = async (operation) => operation();
    await vi.advanceTimersByTimeAsync(10);
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
    await test.manager.shutdown();
  });
  it('can disable even while provider admission is unavailable', async () => {
    const test = setup();
    await test.manager.start();
    test.update({ isCloudflareTunnelEnabled: false });
    test.dependencies.withAdmission = vi.fn(async () => {
      throw new Error('busy');
    });
    expect((await test.manager.reconcile()).status).toBe('stopped');
    expect(test.dependencies.withAdmission).not.toHaveBeenCalled();
    expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();
  });
  it('uses a new automatic retry budget after a manual retry repairs startup', async () => {
    vi.useFakeTimers();
    const test = setup();
    vi.mocked(test.dependencies.driver.verify).mockRejectedValue(new Error('missing'));
    await test.manager.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(test.dependencies.driver.verify).toHaveBeenCalledTimes(3);
    vi.mocked(test.dependencies.driver.verify).mockResolvedValue(undefined);
    await test.manager.reconcile();
    vi.mocked(test.dependencies.driver.launch).mock.calls[0]![0].onExit();
    await vi.advanceTimersByTimeAsync(10);
    expect(test.dependencies.driver.launch).toHaveBeenCalledTimes(2);
    await test.manager.shutdown();
  });
  it('retries failed cleanup after a saved disable without launching a replacement', async () => {
    vi.useFakeTimers();
    const test = setup();
    await test.manager.start();
    test.update({ isCloudflareTunnelEnabled: false });
    const stop = vi.mocked(test.connectors[0]!.stop);
    stop.mockRejectedValue(new Error('OS refused'));
    expect((await test.manager.reconcile()).status).toBe('error');
    stop.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(10);
    expect(test.manager.snapshot().status).toBe('stopped');
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
  });
  it('retries an explicit failed stop without treating it as an instruction to start again', async () => {
    vi.useFakeTimers();
    const test = setup();
    await test.manager.start();
    const stop = vi.mocked(test.connectors[0]!.stop);
    stop.mockRejectedValueOnce(new Error('OS refused'));
    expect((await test.manager.stop()).status).toBe('error');
    await vi.advanceTimersByTimeAsync(10);
    expect(test.manager.snapshot().status).toBe('stopped');
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
  });
  it('reconciles changed named credentials/name but leaves unchanged requests alone', async () => {
    const test = setup();
    test.update({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'first' });
    await test.manager.start();
    await test.manager.reconcile();
    expect(test.dependencies.provision).toHaveBeenCalledOnce();
    test.update({ cloudflareGlobalApiKey: 'repaired', cloudflareTunnelName: 'second' });
    expect(await test.manager.reconcile()).toMatchObject({ status: 'running', name: 'second' });
    expect(test.dependencies.provision).toHaveBeenCalledTimes(2);
    await test.manager.shutdown();
  });
  it('stops and fails closed if committed settings cannot be read', async () => {
    vi.useFakeTimers();
    const test = setup();
    await test.manager.start();
    test.dependencies.settings = () => {
      throw new Error('unreadable');
    };
    expect((await test.manager.reconcile()).status).toBe('error');
    expect(test.connectors[0]!.stop).toHaveBeenCalledOnce();
    expect(test.dependencies.driver.launch).toHaveBeenCalledOnce();
    await test.manager.shutdown();
  });
});
