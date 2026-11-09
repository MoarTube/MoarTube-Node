import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: ['tests/unit/database/authority.test.ts'],
    coverage: { enabled: false },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
