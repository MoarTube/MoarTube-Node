// Run the broad audit group with stdout/stderr written directly to one file.
// This preserves Vitest's actual exit status under Windows PowerShell too.
import { openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const selected = process.argv.includes('--all')
  ? []
  : [
      'tests/cache',
      'tests/unit/services/cdn-media.test.ts',
      'tests/unit/services/cdn-followup-silo.test.ts',
      'tests/unit/services/cdn-followup-cloudflare.test.ts',
      'tests/unit/services/cdn-invalidation.test.ts',
      'tests/unit/services/cdn-recovery.test.ts',
      'tests/unit/services/cdn-provider-state.test.ts',
      'tests/unit/services/cloudflare.test.ts',
      'tests/unit/services/storage.test.ts',
      'tests/unit/services/storage-migration.test.ts',
      'tests/unit/services/settings.test.ts',
      'tests/unit/services/videos.test.ts',
      'tests/unit/controllers/videos.test.ts',
      'tests/unit/controllers/cloudflare-cdn-tunnel.test.ts',
      'tests/unit/plugins/index.test.ts',
      'tests/unit/utils/comment-cache.test.ts',
      'tests/unit/utils/public-files.test.ts',
      'tests/unit/controllers/cdn-html-errors.test.ts',
      'tests/unit/controllers/cdn-segment-cleanup.test.ts',
      'tests/unit/controllers/settings.test.ts',
      'tests/unit/controllers/watch.test.ts',
      'tests/unit/controllers/watch-embed.test.ts',
      'tests/unit/browser-memory.test.ts',
    ];
const log = openSync('cache-audit-full-tests.log', 'w');
try {
  const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', '--coverage.enabled', 'false', ...selected],
    { stdio: ['ignore', log, log], windowsHide: true }
  );
  if (result.error) throw result.error;
  console.log(`Vitest exit status: ${result.status}; details: cache-audit-full-tests.log`);
  process.exitCode = result.status ?? 1;
} finally {
  closeSync(log);
}
