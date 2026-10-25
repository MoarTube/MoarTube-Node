import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const guard = readFileSync('bin/check-node-version.js', 'utf8');

describe('minimum Node.js version', () => {
  it.each(['24.22.1', '24.22.2', '24.23.0', '24.100.0', '25.0.0', '26.0.0'])(
    'accepts %s',
    (node) => {
      const exit = vi.fn();
      runInNewContext(guard, { process: { versions: { node }, exit } });
      expect(exit).not.toHaveBeenCalled();
    }
  );

  it.each(['20.19.0', '22.99.99', '24.9.9', '24.21.99', '24.22.0', '24.22.1-rc.1'])(
    'rejects %s with an actionable error',
    (node) => {
      const exit = vi.fn();
      const error = vi.fn();
      runInNewContext(guard, { process: { versions: { node }, exit }, console: { error } });
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(
        `MoarTube requires Node.js 24.22.1 or newer. Current: ${node}`
      );
    }
  );

  it('rejects an old runtime before clean startup can remove data', () => {
    const preload =
      'data:text/javascript,' +
      encodeURIComponent("Object.defineProperty(process.versions, 'node', { value: '24.22.0' });");
    const result = spawnSync(
      process.execPath,
      ['--import', preload, 'bin/moartube-node-start', '--clean'],
      { encoding: 'utf8', timeout: 10_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MoarTube requires Node.js 24.22.1 or newer');
    expect(result.stdout).not.toContain('Removing');
  });
});
