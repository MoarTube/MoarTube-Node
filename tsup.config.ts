import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/moartube-node.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  treeshake: true,
  minify: false,
  skipNodeModulesBundle: true,
  external: [
    // Keep native modules external
    'better-sqlite3',
    'sharp',
    'pg-native',
  ],
  esbuildOptions(options) {
    options.charset = 'utf8';
  },
});
