import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const suites = [
  ['Unit tests', 'vitest.config.ts'],
  ['SQLite integration tests', 'vitest.sqlite.integration.config.ts'],
  ['PostgreSQL integration tests', 'vitest.postgres.integration.config.ts'],
];

let failed = false;
// Run main coverage first: it cleans coverage/, then integrations write their own subfolders.
// Separate Vitest processes prevent mock coverage from leaking into either integration report.
for (const [name, config] of suites) {
  console.log(`\n${name}\n`);
  const result = spawnSync(
    process.execPath,
    [vitest, 'run', '--config', config, ...process.argv.slice(2)],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed = true;
}
// Still generate the other reports if an earlier suite fails, but fail the overall command.
process.exitCode = failed ? 1 : 0;
