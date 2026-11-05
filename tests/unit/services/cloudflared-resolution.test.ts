import path from 'node:path';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCloudflaredExecutable } from '@/services/cloudflared.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('npm connector resolution', () => {
  it('removes a failed private executable copy and preserves the copy error',()=>{
    vi.stubGlobal('process',{...process,platform:'linux',arch:'arm64'});vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH',undefined);
    vi.spyOn(fs,'existsSync').mockReturnValue(true);vi.spyOn(fs,'statSync').mockReturnValue({mode:0o644} as fs.Stats);
    vi.spyOn(fs,'chmodSync').mockImplementationOnce(()=>{throw new Error('readonly')}).mockImplementation(()=>{});
    vi.spyOn(fs,'mkdtempSync').mockReturnValue('/private-temp/copy');vi.spyOn(fs,'copyFileSync').mockImplementation(()=>{throw new Error('copy denied')});
    const remove=vi.spyOn(fs,'rmSync').mockImplementation(()=>{});
    expect(()=>resolveCloudflaredExecutable()).toThrow('copy denied');expect(remove).toHaveBeenCalledWith('/private-temp/copy',{recursive:true,force:true});
  });
  it('honors an explicit path before looking for bundled executables', () => {
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', '/custom path/cloudflared');
    const exists = vi.spyOn(fs, 'existsSync');
    expect(resolveCloudflaredExecutable()).toBe('/custom path/cloudflared');
    expect(exists).not.toHaveBeenCalled();
  });

  it('resolves the platform executable independently of the working directory', () => {
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o755 } as fs.Stats);
    const resolved = resolveCloudflaredExecutable();
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toContain(
      path.join('resources', 'cloudflared', `${process.platform}-${process.arch}`)
    );
    expect(path.basename(resolved)).toBe(
      process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );
  });

  it('uses the source checkout bundle when it is not alongside a dist entry', () => {
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', undefined);
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o755 } as fs.Stats);
    const resolved = resolveCloudflaredExecutable();
    expect(resolved).toBe(exists.mock.calls[1]![0]);
  });

  it('retains PATH fallback for source checkouts and unsupported targets', () => {
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolveCloudflaredExecutable()).toBe('cloudflared');
  });

  it('repairs Unix executable permission bits in a package packed on Windows', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64' });
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o644 } as fs.Stats);
    const chmod = vi.spyOn(fs, 'chmodSync').mockImplementation(() => {});
    const resolved = resolveCloudflaredExecutable();
    expect(chmod).toHaveBeenCalledWith(resolved, 0o755);
  });

  it('uses a private executable copy when a global npm installation is read-only', () => {
    const onExit = vi.fn();
    vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64', once: onExit });
    vi.stubEnv('MOARTUBE_CLOUDFLARED_PATH', undefined);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o644 } as fs.Stats);
    vi.spyOn(fs, 'chmodSync')
      .mockImplementationOnce(() => {
        throw new Error('EPERM');
      })
      .mockImplementation(() => {});
    vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/private-temp/connector');
    const copy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    const remove = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    const resolved = resolveCloudflaredExecutable();
    expect(resolved).toBe(path.join('/private-temp/connector', 'cloudflared'));
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('resources'), resolved);
    expect(onExit).toHaveBeenCalledWith('exit', expect.any(Function));
    (onExit.mock.calls[0]![1] as () => void)();
    expect(remove).toHaveBeenCalledWith('/private-temp/connector', {
      recursive: true,
      force: true,
    });
  });
});
