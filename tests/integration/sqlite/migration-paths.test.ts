import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { componentDirectory } from '../../../src/config/data-layout.cjs';

let root: string;
let checkout: string;
let modules: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'moartube-migration-paths-'));
  checkout = path.join(root, 'checkout');
  mkdirSync(path.join(checkout, 'scripts'), { recursive: true });
  for (const name of ['src', 'drizzle'])
    cpSync(name, path.join(checkout, name), { recursive: true });
  for (const name of ['package.json', 'tsconfig.json']) cpSync(name, path.join(checkout, name));
  cpSync('scripts/migrate.ts', path.join(checkout, 'scripts/migrate.ts'));
  modules = path.join(checkout, 'node_modules');
  symlinkSync(path.resolve('node_modules'), modules, 'junction');
});
afterAll(() => {
  if (modules && existsSync(modules)) unlinkSync(modules);
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('moartube-migration-paths-')
  ) {
    throw new Error('Unexpected migration fixture path');
  }
  rmSync(root, { recursive: true, force: true });
});

it.each(['source', 'directory', 'root', 'url', 'dotenv', 'installed'] as const)(
  'migrates the expected database for %s path selection',
  (mode) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_DIALECT: 'sqlite',
      DATABASE_URL: undefined,
      MOARTUBE_DATA_DIR: undefined,
      MOARTUBE_DATA_ROOT: undefined,
      IS_DOCKER_ENVIRONMENT: undefined,
      APPDATA: path.join(root, 'installed'),
      HOME: path.join(root, 'installed'),
      XDG_DATA_HOME: path.join(root, 'installed'),
      DOTENV_CONFIG_PATH: path.join(root, mode + '.env'),
    };
    let expected = path.join(checkout, 'data/db/node_db.sqlite');
    if (mode === 'directory') {
      env.MOARTUBE_DATA_DIR = path.join(root, 'explicit-node');
      expected = path.join(env.MOARTUBE_DATA_DIR, 'db/node_db.sqlite');
    } else if (mode === 'root') {
      env.MOARTUBE_DATA_ROOT = path.join(root, 'shared');
      expected = path.join(env.MOARTUBE_DATA_ROOT, 'MoarTube/node/db/node_db.sqlite');
    } else if (mode === 'url') {
      env.DATABASE_URL = path.join(root, 'database-url/explicit.sqlite');
      env.MOARTUBE_DATA_DIR = path.join(root, 'unused-directory');
      expected = env.DATABASE_URL;
    } else if (mode === 'dotenv') {
      expected = path.join(root, 'dotenv-node/db/node_db.sqlite');
      writeFileSync(
        env.DOTENV_CONFIG_PATH!,
        'MOARTUBE_DATA_DIR=' + JSON.stringify(path.dirname(path.dirname(expected)))
      );
    } else if (mode === 'installed') {
      rmSync(path.join(checkout, 'src/moartube-node.ts'));
      expected = path.join(componentDirectory('node', { env }), 'db/node_db.sqlite');
    }
    // Run from outside the checkout: the application root must come from the script.
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('node_modules/tsx/dist/cli.mjs'),
        '--tsconfig',
        path.join(checkout, 'tsconfig.json'),
        path.join(checkout, 'scripts/migrate.ts'),
      ],
      { cwd: root, env, encoding: 'utf8', timeout: 15000 }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(expected)).toBe(true);
    const db = new Database(expected, { readonly: true });
    try {
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'").get()
      ).toEqual({ name: 'videos' });
    } finally {
      db.close();
    }
    if (mode !== 'installed') {
      expect(
        existsSync(
          path.join(
            componentDirectory('node', {
              env: { ...env, MOARTUBE_DATA_DIR: undefined, MOARTUBE_DATA_ROOT: undefined },
            }),
            'db/node_db.sqlite'
          )
        )
      ).toBe(false);
    }
    expect(existsSync(path.join(root, 'unused-directory'))).toBe(false);
  },
  20000
);
