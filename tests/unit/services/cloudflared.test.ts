import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }));
vi.mock('node:child_process', () => mocks);
import { CloudflaredDriver } from '@/services/cloudflared.js';

let child: EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.clearAllMocks();
  child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', 0));
      return true;
    }),
  });
  mocks.spawn.mockReturnValue(child);
  mocks.execFile.mockImplementation((_file, _args, _options, callback) =>
    callback(null, { stdout: 'cloudflared version 2026.10.7', stderr: '' })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function launch(mode: 'quick' | 'named' = 'quick') {
  const controller = new AbortController();
  const onExit = vi.fn();
  const connector = new CloudflaredDriver('cloudflared-test', 100).launch({
    mode,
    origin: 'http://127.0.0.1:9090',
    signal: controller.signal,
    onExit,
    ...(mode === 'named' ? { token: 'private-token' } : {}),
  });
  return { connector, controller, onExit };
}

describe('cloudflared process driver', () => {
  it('handles a rejected termination caused by abort without an unhandled rejection',async()=>{
    vi.useFakeTimers();const test=launch();child.kill.mockReturnValue(true);test.controller.abort();
    const rejected=expect(test.connector.ready).rejects.toThrow();await vi.advanceTimersByTimeAsync(10000);await rejected;
    child.emit('close',1);await test.connector.stop();expect(test.onExit).not.toHaveBeenCalled();
  });
  it('handles an already aborted startup and repeated stop after unexpected close',async()=>{
    const controller=new AbortController();controller.abort();
    const connector=new CloudflaredDriver('test').launch({mode:'quick',origin:'http://localhost',signal:controller.signal,onExit:vi.fn()});
    await expect(connector.ready).rejects.toThrow();await connector.stop();
    const second=launch();child.emit('close',1);await expect(second.connector.ready).rejects.toThrow();await second.connector.stop();
  });
  it('surfaces forced termination failure and permits a later stop attempt',async()=>{
    vi.useFakeTimers();const test=launch();child.kill.mockReturnValue(true);
    const failed=expect(test.connector.stop()).rejects.toThrow('did not stop');await vi.advanceTimersByTimeAsync(10000);await failed;
    child.kill.mockImplementation(()=>{queueMicrotask(()=>child.emit('close',0));return true});await test.connector.stop();
  });
  it('settles readiness before the startup deadline and swallows failed timeout cleanup',async()=>{
    vi.useFakeTimers();const test=launch();child.kill.mockReturnValue(true);
    const failed=expect(test.connector.ready).rejects.toThrow();await vi.advanceTimersByTimeAsync(10100);await failed;
    child.emit('close',1);await test.connector.stop();expect(test.onExit).not.toHaveBeenCalled();
  });
  it('verifies a real cloudflared version and rejects invalid executables', async () => {
    await expect(new CloudflaredDriver('override').verify()).resolves.toBeUndefined();
    expect(mocks.execFile).toHaveBeenCalledWith(
      'override',
      ['--version'],
      expect.objectContaining({ windowsHide: true, timeout: 5000 }),
      expect.any(Function)
    );
    mocks.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, { stdout: 'other tool', stderr: '' })
    );
    await expect(new CloudflaredDriver().verify()).rejects.toThrow('Invalid');
  });

  it('waits for both a generated URL and registered connection and cleans up on stop', async () => {
    const test = launch();
    let ready = false;
    void test.connector.ready.then(() => {
      ready = true;
    });
    child.stderr.write('https://generated-words.trycloudflare.com\n');
    await Promise.resolve();
    expect(ready).toBe(false);
    child.stdout.write('{"message":"Registered tunnel connec');
    child.stdout.write('tion"}\n');
    expect(await test.connector.ready).toEqual({
      publicUrl: 'https://generated-words.trycloudflare.com',
    });
    const args = mocks.spawn.mock.calls[0]![1] as string[];
    expect(args).toContain('--output');
    expect(args).not.toContain('--logformat');
    const config = args[args.indexOf('--config') + 1]!;
    expect(fs.existsSync(config)).toBe(true);
    await test.connector.stop();
    expect(fs.existsSync(config)).toBe(false);
    expect(test.onExit).not.toHaveBeenCalled();
  });

  it('keeps tokens out of arguments and uses a shell-free hidden child', async () => {
    const test = launch('named');
    child.stderr.write('Registered tunnel connection\n');
    await test.connector.ready;
    const [executable, args, options] = mocks.spawn.mock.calls[0]!;
    expect(executable).toBe('cloudflared-test');
    expect(args).toContain('run');
    expect(JSON.stringify(args)).not.toContain('private-token');
    expect(options).toMatchObject({
      shell: false,
      windowsHide: true,
      env: { TUNNEL_TOKEN: 'private-token' },
    });
    await test.connector.stop();
  });

  it('removes inherited tunnel credentials/options from quick children', async () => {
    vi.stubEnv('TUNNEL_TOKEN', 'unrelated-token');
    vi.stubEnv('TUNNEL_URL', 'http://other-origin');
    const test = launch();
    const options = mocks.spawn.mock.calls[0]![2];
    expect(options.env).not.toHaveProperty('TUNNEL_TOKEN');
    expect(options.env).not.toHaveProperty('TUNNEL_URL');
    await test.connector.stop();
    await expect(test.connector.ready).rejects.toThrow();
  });

  it('aborts pending startup and suppresses unexpected-exit callbacks on requested stop', async () => {
    const test = launch();
    test.controller.abort();
    await expect(test.connector.ready).rejects.toThrow();
    await test.connector.stop();
    expect(test.onExit).not.toHaveBeenCalled();
  });

  it('reports unexpected exit and rejects pending readiness', async () => {
    const test = launch();
    child.emit('close', 1);
    await expect(test.connector.ready).rejects.toThrow();
    expect(test.onExit).toHaveBeenCalledOnce();
  });

  it('times out startup and waits for the stopped process', async () => {
    vi.useFakeTimers();
    const test = launch();
    const failed = expect(test.connector.ready).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    await test.connector.stop();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('escalates to SIGKILL if graceful stop does not complete', async () => {
    vi.useFakeTimers();
    const test = launch();
    child.kill.mockImplementation((signal: string) => {
      if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', 0));
      return true;
    });
    const stopping = test.connector.stop();
    await vi.advanceTimersByTimeAsync(5000);
    await stopping;
    expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
  });
});
