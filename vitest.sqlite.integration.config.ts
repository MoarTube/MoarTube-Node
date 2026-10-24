import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/integration/sqlite/**/*.test.ts'],
    coverage: {
      ...base.test?.coverage,
      reportsDirectory: 'coverage/sqlite-integration',
      include: [
        'src/database/sqlite-connection.ts',
        'src/database/repositories/*/sqlite.ts',
        'src/database/schemas/sqlite/**/*.ts',
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
    },
  },
});
