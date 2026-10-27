import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2),
  position = args.indexOf('--out-root');
const output = position < 0 ? path.join(root, 'drizzle') : path.resolve(args[position + 1]);
for (const [folder, dialect] of [
  ['sqlite', 'sqlite'],
  ['postgres', 'postgresql'],
]) {
  const out = path.join(output, folder),
    journal = path.join(out, 'meta', '_journal.json');
  if (existsSync(journal)) {
    const { entries } = JSON.parse(readFileSync(journal, 'utf8'));
    if (
      !Array.isArray(entries) ||
      !entries.length ||
      entries.some((entry) => !existsSync(path.join(out, entry.tag + '.sql')))
    )
      throw new Error(
        'Incomplete migration history in ' + out + '. Restore it before using an existing database.'
      );
    continue;
  }
  if (existsSync(out) && readdirSync(out).length)
    throw new Error(
      'Incomplete migration history in ' +
        out +
        '. Restore it or use a new, empty migrations directory with a new database.'
    );
  mkdirSync(out, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/tsx/dist/cli.mjs'),
      path.join(root, 'node_modules/drizzle-kit/bin.cjs'),
      'generate',
      '--dialect',
      dialect,
      '--schema',
      path.join(root, 'src/database/schemas', folder, 'index.ts').replaceAll('\\', '/'),
      '--out',
      out.replaceAll('\\', '/'),
      '--name',
      'standalone',
    ],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      'Migration generation failed for ' +
        dialect +
        ' (exit ' +
        String(result.status ?? result.signal) +
        ')'
    );
}
