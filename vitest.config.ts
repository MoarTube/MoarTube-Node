/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const fullCoverage = { statements: 100, branches: 100, functions: 100, lines: 100 };

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      clean: true,
      include: ['src/**/*.{js,ts}'],
      exclude: ['**/*.d.ts', '**/*.config.*', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
      thresholds: {
        ...fullCoverage,
        perFile: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
      '@core': resolve(__dirname, './src/core'),
      '@database': resolve(__dirname, './src/database'),
      '@errors': resolve(__dirname, './src/errors'),
      '@services': resolve(__dirname, './src/services'),
      '@controllers': resolve(__dirname, './src/controllers'),
      '@routes': resolve(__dirname, './src/routes'),
      '@plugins': resolve(__dirname, './src/plugins'),
      '@utils': resolve(__dirname, './src/utils'),
      '@validators': resolve(__dirname, './src/validators'),
      '@websocket': resolve(__dirname, './src/websocket'),
      '@workers': resolve(__dirname, './src/workers'),
      '@types': resolve(__dirname, './src/types'),
    },
  },
});
