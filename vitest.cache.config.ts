import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

// Cache/header/browser contracts can run without the S3 container fixture.
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/cache/**/*.test.ts'],
    coverage: { enabled: false },
  },
});
