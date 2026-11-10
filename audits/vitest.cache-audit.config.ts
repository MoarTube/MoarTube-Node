import { defineConfig } from 'vitest/config';
import base from '../vitest.config.js';

export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/cache/audit-fixes.test.ts', 'tests/cache/asset-retention.test.ts'],
    coverage: { enabled: false },
  },
});
