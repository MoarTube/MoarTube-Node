import { build } from 'esbuild';

await build({
  entryPoints: ['client/videojs-10.2.0.js'],
  outfile: 'public/javascript/videojs-10.2.0.js',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  legalComments: 'linked',
});
