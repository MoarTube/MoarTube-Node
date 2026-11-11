import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TunnelRateLimitError } from '@/utils/tunnel-errors.js';
import type { TunnelConnector, TunnelDriver } from '@/types/cloudflare-tunnel.js';

const execute = promisify(execFile);

/** Resolve relative to the installed package, independent of the launcher's working directory. */
export function resolveCloudflaredExecutable(): string {
  const override = process.env['MOARTUBE_CLOUDFLARED_PATH'];
  if (override !== undefined) {
    return override;
  }
  const target = `${process.platform}-${process.arch}`;
  const filename = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  // First path is for the bundled dist entry; second is for source development.
  for (const relative of ['../resources/cloudflared/', '../../resources/cloudflared/']) {
    const candidate = fileURLToPath(new URL(`${relative}${target}/${filename}`, import.meta.url));
    if (fs.existsSync(candidate)) {
      // npm packs created on Windows may lose executable bits on Unix.
      if (process.platform !== 'win32' && (fs.statSync(candidate).mode & 0o111) === 0) {
        try {
          fs.chmodSync(candidate, 0o755);
        } catch {
          // Global npm packages can be read-only to the account running Node.
          const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-cloudflared-bin-'));
          fs.chmodSync(directory, 0o700);
          const executable = path.join(directory, 'cloudflared');
          try {
            fs.copyFileSync(candidate, executable);
            fs.chmodSync(executable, 0o755);
          } catch (error) {
            fs.rmSync(directory, { recursive: true, force: true });
            throw error;
          }
          process.once('exit', () => {
            try {
              fs.rmSync(directory, { recursive: true, force: true });
            } catch {
              // OS temporary-file cleanup can remove a leftover executable.
            }
          });
          return executable;
        }
      }
      return candidate;
    }
  }
  // Source checkouts, Docker, and unsupported architectures can use an installed binary.
  return 'cloudflared';
}

/** Does not log raw output or put connector tokens in process arguments. */
export class CloudflaredDriver implements TunnelDriver {
  constructor(
    private readonly executable = resolveCloudflaredExecutable(),
    private readonly startupTimeout = 60_000
  ) {}

  async verify(): Promise<void> {
    const result = await execute(this.executable, ['--version'], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 8192,
    });
    if (!/cloudflared version \d+\.\d+\.\d+/.test(result.stdout)) {
      throw new Error('Invalid cloudflared executable');
    }
  }

  launch(options: Parameters<TunnelDriver['launch']>[0]): TunnelConnector {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-cloudflared-'));
    fs.chmodSync(directory, 0o700);
    const config = path.join(directory, 'config.yml');
    fs.writeFileSync(config, '{}\n', { mode: 0o600 });
    const env = { ...process.env };
    // Do not accidentally inherit a token or origin configuration for a quick tunnel.
    for (const key of Object.keys(env)) {
      if (key.startsWith('TUNNEL_')) {
        Reflect.deleteProperty(env, key);
      }
    }
    if (options.token !== undefined) {
      env['TUNNEL_TOKEN'] = options.token;
    }
    const args = ['tunnel', '--config', config, '--no-autoupdate', '--output', 'json'];
    if (options.mode === 'quick') {
      args.push('--url', options.origin);
    } else {
      args.push('run');
    }
    const child = spawn(this.executable, args, {
      shell: false,
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let complete = false;
    let requestedStop = false;
    let closed = false;
    let registered = false;
    let publicUrl: string | undefined;
    let resolveReady: (value: { publicUrl?: string | undefined }) => void;
    let rejectReady: (error: Error) => void;
    const ready = new Promise<{ publicUrl?: string | undefined }>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // stop() can abort before the manager has attached to readiness.
    void ready.catch(() => {});
    let rateLimited = false;
    const fail = (): void => {
      if (!complete) {
        complete = true;
        rejectReady(
          rateLimited
            ? new TunnelRateLimitError(
                'Cloudflare is rate-limiting Quick Tunnel creation (HTTP 429).'
              )
            : new Error('cloudflared did not become ready')
        );
      }
    };
    const timer = setTimeout(() => {
      fail();
      void stop().catch(() => {});
    }, this.startupTimeout);
    timer.unref();
    const buffers = { stdout: '', stderr: '' };
    const output = (kind: keyof typeof buffers, chunk: Buffer): void => {
      buffers[kind] = (buffers[kind] + chunk.toString()).slice(-32768);
      if (
        options.mode === 'quick' &&
        /quick tunnel provisioning failed with status 429\b/i.test(buffers[kind])
      ) {
        rateLimited = true;
      }
      const lines = buffers[kind].split(/\r?\n/);
      // split() always returns at least one element, including for an empty buffer.
      buffers[kind] = lines.pop() as string;
      for (const line of lines) {
        const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/.exec(line)?.[0];
        if (url !== undefined) {
          publicUrl = url;
        }
        if (/Registered tunnel connection/.test(line)) {
          registered = true;
        }
      }
      if (!complete && registered && (options.mode === 'named' || publicUrl !== undefined)) {
        complete = true;
        clearTimeout(timer);
        resolveReady({ publicUrl });
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      output('stdout', chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output('stderr', chunk);
    });
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => {
        closed = true;
        clearTimeout(timer);
        fail();
        options.signal.removeEventListener('abort', abort);
        try {
          fs.rmSync(directory, { recursive: true, force: true });
        } catch {
          // Child termination must still settle if temporary-file cleanup is unavailable.
        }
        resolve();
        if (!requestedStop) {
          options.onExit();
        }
      });
    });
    child.once('error', fail);
    let stopping: Promise<void> | undefined;
    const waitForExit = async (milliseconds: number): Promise<boolean> => {
      let timeout: NodeJS.Timeout | undefined;
      const stopped = await Promise.race([
        exited.then(() => true),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => {
            resolve(false);
          }, milliseconds);
        }),
      ]);
      clearTimeout(timeout);
      return stopped;
    };
    const stop = (): Promise<void> => {
      stopping ??= (async (): Promise<void> => {
        requestedStop = true;
        clearTimeout(timer);
        fail();
        if (closed) {
          return;
        }
        child.kill('SIGTERM');
        if (await waitForExit(5000)) {
          return;
        }
        child.kill('SIGKILL');
        if (!(await waitForExit(5000))) {
          throw new Error('cloudflared did not stop');
        }
      })();
      // Allow a later cleanup attempt if the OS rejected termination.
      void stopping.catch(() => {
        stopping = undefined;
      });
      return stopping;
    };
    const abort = (): void => {
      void stop().catch(() => {});
    };
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) {
      abort();
    }
    return { ready, stop };
  }
}
