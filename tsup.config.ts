import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/moartube-node.ts'],
  format: ['esm'],
  target: 'node24',
  // Bundlers hoist dependency imports; check the runtime before they load.
  banner: {
    js: "import '../bin/check-node-version.js';",
  },
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  treeshake: true,
  minify: false,
  skipNodeModulesBundle: true,
  external: [
    '../bin/check-node-version.js',
    // Keep native modules external
    'better-sqlite3',
    'sharp',
    'pg-native',
  ],
  esbuildOptions(options) {
    options.charset = 'utf8';
  },
  async onSuccess() {
    // Copy drizzle migrations to dist folder
    cpSync('drizzle', 'dist/drizzle', { recursive: true });
    console.log('Copied drizzle migrations to dist/drizzle');

    // Copy public folder (views, css, js, images, fonts) to dist folder
    cpSync('public', 'dist/public', { recursive: true });
    console.log('Copied public folder to dist/public');
  },
});
