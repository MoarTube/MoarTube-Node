import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  manager: {
    reconcile: vi.fn(),
    restart: vi.fn(),
    shutdown: vi.fn(),
    snapshot: vi.fn(),
    prepareCdnClear: vi.fn(),
  },
  send: vi.fn(),
  kill: vi.fn(),
  fork: vi.fn(),
  clusterOn: vi.fn(),
}));
vi.mock('node:cluster', () => ({
  default: { isPrimary: true, fork: mocks.fork, on: mocks.clusterOn },
}));
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({
  primaryTunnelManager: () => mocks.manager,
}));
vi.mock('@/core/cluster/ipc-channel.js', () => ({
  IPCChannel: class {
    on(command: string, handler: (...args: any[]) => any) {
      mocks.handlers.set(command, handler);
    }
    startListening() {}
    broadcast() {}
    getWorkers() {
      return [{ kill: mocks.kill }];
    }
    sendToWorker(...args: unknown[]) {
      mocks.send(...args);
    }
  },
}));
vi.mock('@/config/index.js', () => ({
  getConfig: () => ({ runtime: { isDevelopment: false }, paths: { dataDirectoryPath: '/test' }, cleanup:vi.fn() }),
}));
vi.mock('@/database/index.js', () => ({
  createDatabase: vi.fn(),
  initializeDatabaseSchema: vi.fn(),
}));
import { ClusterMaster } from '@/core/cluster/master.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  vi.useFakeTimers();
  vi.spyOn(process, 'once').mockReturnValue(process);
  vi.spyOn(process, 'on').mockReturnValue(process);
  mocks.manager.reconcile.mockResolvedValue({ status: 'running' });
  mocks.manager.shutdown.mockResolvedValue(undefined);
  mocks.manager.snapshot.mockReturnValue({ mode: 'none', status: 'stopped', name: '' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function master() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const instance = new ClusterMaster(logger as never, {} as never);
  instance.start();
  return instance;
}

describe('primary tunnel cluster integration', () => {
  it.each([false,true])('runs graceful signal cleanup and reports a rejected shutdown (failure=%s)',async failure=>{
    const exit=vi.spyOn(process,'exit').mockImplementation(()=>undefined as never);
    const instance=master();mocks.handlers.get('worker_http_ready')!({port:9090});
    if(failure)mocks.manager.shutdown.mockRejectedValue(new Error('stop failed'));
    const handler=vi.mocked(process.once).mock.calls.find(([name])=>name==='SIGTERM')![1];handler();
    await vi.waitFor(()=>expect(exit).toHaveBeenCalledWith(failure?1:0));
    if(failure)await expect(instance.stop()).rejects.toThrow('stop failed');else await instance.stop();
  });
  it('ignores requests without a worker, dispatches reconcile and isolates startup rejection',async()=>{
    const instance=master();await mocks.handlers.get('cloudflare_tunnel_request')!({operation:'reconcile'});
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.manager.reconcile.mockRejectedValueOnce(new Error('startup failed'));
    mocks.handlers.get('worker_http_ready')!({port:9090});await Promise.resolve();
    mocks.manager.reconcile.mockResolvedValue({mode:'quick',status:'running',name:'x'});
    await mocks.handlers.get('cloudflare_tunnel_request')!({requestId:'r',operation:'reconcile'},{});
    expect(mocks.send).toHaveBeenCalledWith({},expect.objectContaining({requestId:'r',tunnel:{status:'running',mode:'quick',name:'x'}}));
    await instance.stop();expect(instance.stop()).toBeDefined();
  });
  it('returns correlated restoration errors promptly without exposing provider details', async () => {
    const instance = master();
    const worker = {};
    mocks.handlers.get('worker_http_ready')!({ port: 9090 });
    mocks.manager.prepareCdnClear.mockRejectedValue(new Error('private-key'));
    await mocks.handlers.get('cloudflare_tunnel_request')!(
      { requestId: 'restore', operation: 'prepare_cdn_clear' },
      worker
    );
    expect(mocks.send).toHaveBeenCalledWith(
      worker,
      expect.objectContaining({
        requestId: 'restore',
        error: 'Cloudflare Tunnel operation failed.',
      })
    );
    expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('private-key');
    await instance.stop();
  });
  it('waits for readiness and starts once across many workers on the same port', async () => {
    const instance = master();
    expect(mocks.manager.reconcile).not.toHaveBeenCalled();
    mocks.handlers.get('worker_http_ready')!({ port: 9090 });
    mocks.handlers.get('worker_http_ready')!({ port: 9090 });
    expect(mocks.manager.reconcile).toHaveBeenCalledOnce();
    mocks.handlers.get('worker_http_ready')!({ port: 9091 });
    expect(mocks.manager.reconcile).toHaveBeenCalledTimes(2);
    await instance.stop();
    expect(mocks.manager.shutdown).toHaveBeenCalledOnce();
  });

  it('returns correlated snapshots and serializes requested restarts through the manager', async () => {
    const instance = master();
    const worker = {};
    await mocks.handlers.get('cloudflare_tunnel_request')!(
      { requestId: 'one', operation: 'snapshot' },
      worker
    );
    expect(mocks.send).toHaveBeenCalledWith(
      worker,
      expect.objectContaining({
        cmd: 'cloudflare_tunnel_response',
        requestId: 'one',
        tunnel: { mode: 'none', status: 'stopped', name: '' },
      })
    );
    mocks.handlers.get('worker_http_ready')!({ port: 9090 });
    mocks.manager.restart.mockResolvedValue({ mode: 'quick', status: 'running', name: 'random' });
    await mocks.handlers.get('cloudflare_tunnel_request')!(
      { requestId: 'two', operation: 'restart' },
      worker
    );
    expect(mocks.manager.restart).toHaveBeenCalledOnce();
    await instance.stop();
  });

  it('awaits connector cleanup before killing workers and suppresses shutdown respawn', async () => {
    const instance = master();
    mocks.handlers.get('worker_http_ready')!({ port: 9090 });
    let finish!: () => void;
    mocks.manager.shutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const stop = instance.stop();
    expect(mocks.kill).not.toHaveBeenCalled();
    const exit = mocks.clusterOn.mock.calls.find(([event]) => event === 'exit')![1];
    mocks.fork.mockClear();
    exit({ id: 1 }, 0, 'SIGTERM');
    expect(mocks.fork).not.toHaveBeenCalled();
    finish();
    await stop;
    expect(mocks.kill).toHaveBeenCalledWith('SIGTERM');
    mocks.handlers.get('worker_http_ready')!({ port: 9092 });
    expect(mocks.manager.reconcile).toHaveBeenCalledOnce();
  });
});
