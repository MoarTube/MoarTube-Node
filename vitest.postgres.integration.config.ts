import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/integration/postgres/**/*.test.ts'],
    coverage: {
      ...base.test?.coverage,
      reportsDirectory: 'coverage/postgres-integration',
      include: [
        'src/database/postgres-connection.ts',
        'src/database/repositories/*/postgres.ts',
        'src/database/schemas/postgres/**/*.ts',
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
    },
  },
});
