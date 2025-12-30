/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
      '@core': resolve(__dirname, './src/core'),
      '@database': resolve(__dirname, './src/database'),
      '@services': resolve(__dirname, './src/services'),
      '@controllers': resolve(__dirname, './src/controllers'),
      '@routes': resolve(__dirname, './src/routes'),
      '@plugins': resolve(__dirname, './src/plugins'),
      '@utils': resolve(__dirname, './src/utils'),
      '@websocket': resolve(__dirname, './src/websocket'),
      '@workers': resolve(__dirname, './src/workers'),
      '@types': resolve(__dirname, './src/types'),
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    include: ['src/**/*.{js,ts}'],
    exclude: [
      'node_modules/',
      'dist/',
      'bin/',
      'public/',
      'views/',
      'data/',
      'drizzle/',
      '**/*.d.ts',
      '**/*.config.*',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
    ],
  },
});