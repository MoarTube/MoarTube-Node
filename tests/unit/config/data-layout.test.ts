import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanData, componentDirectory, prepareData } from '../../../src/config/data-layout.cjs';
import { Paths } from '@/config/paths.js';
import { Env } from '@/config/env.js';

let root: string;
let projectRoot: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'moartube-node-layout-'));
  projectRoot = path.join(root, 'checkout');
  mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  writeFileSync(path.join(projectRoot, 'src/moartube-node.ts'), '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  Paths.resetInstance();
  Env.resetInstance();
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('moartube-node-layout-')
  )
    throw new Error('Unexpected fixture path');
  rmSync(root, { recursive: true, force: true });
});

it('uses checkout-local paths and locks without inspecting installed data', async () => {
  const env = { APPDATA: path.join(root, 'installed'), HOME: root };
  const options = { projectRoot, env };
  const local = path.join(projectRoot, 'data');
  const installed = componentDirectory('node', { env });
  mkdirSync(installed, { recursive: true });
  writeFileSync(path.join(installed, '_node_settings.json'), 'installed settings');
  // An installed process must not block source startup or be cleaned by it.
  writeFileSync(path.join(installed, '.moartube-process.lock'), 'invalid installed lock');
  expect(componentDirectory('node', options)).toBe(local);
  const release = await prepareData('node', options);
  try {
    expect(existsSync(path.join(local, '.moartube-process.lock'))).toBe(true);
    await expect(prepareData('node', options)).rejects.toThrow('already using');
    expect(() => cleanData('node', options)).toThrow('already using');
  } finally {
    release();
  }
  writeFileSync(path.join(local, 'old'), 'development data');
  cleanData('node', options);
  expect(existsSync(path.join(local, 'old'))).toBe(false);
  expect(readFileSync(path.join(installed, '_node_settings.json'), 'utf8')).toBe(
    'installed settings'
  );
  expect(readFileSync(path.join(installed, '.moartube-process.lock'), 'utf8')).toBe(
    'invalid installed lock'
  );
});

it('preserves installed, Docker and explicitly overridden data paths', () => {
  const env = { APPDATA: path.join(root, 'installed'), HOME: root };
  expect(componentDirectory('node', { projectRoot: path.join(root, 'installed-cli'), env })).toBe(
    componentDirectory('node', { env })
  );
  expect(
    componentDirectory('node', { projectRoot, env: { ...env, IS_DOCKER_ENVIRONMENT: 'true' } })
  ).toBe('/data/MoarTube/node');
  const explicit = path.join(root, 'custom-node');
  expect(
    componentDirectory('node', { projectRoot, env: { ...env, MOARTUBE_DATA_DIR: explicit } })
  ).toBe(explicit);
  expect(
    componentDirectory('node', { projectRoot, env: { ...env, MOARTUBE_DATA_ROOT: root } })
  ).toBe(path.join(root, 'MoarTube', 'node'));
  expect(() =>
    componentDirectory('node', { projectRoot, env: { MOARTUBE_DATA_DIR: 'relative' } })
  ).toThrow('must be an absolute');
});

it.each([true, false])(
  'uses the checkout for configured paths even with isDevelopment=%s',
  (isDevelopment) => {
    vi.stubEnv('NODE_ENV', isDevelopment ? 'development' : 'production');
    vi.stubEnv('MOARTUBE_DATA_DIR', '');
    vi.stubEnv('MOARTUBE_DATA_ROOT', '');
    vi.stubEnv('IS_DOCKER_ENVIRONMENT', 'false');
    Paths.resetInstance();
    const config = Paths.initialize(projectRoot, isDevelopment, path.join(projectRoot, 'dist'));
    expect(config.dataDirectoryPath).toBe(path.join(projectRoot, 'data'));
    expect(config.databaseFilePath).toBe(path.join(projectRoot, 'data', 'db', 'node_db.sqlite'));
  }
);
