// Builds the homeowner's ADU check page script: web/adu/main.ts -> docs/adu.js (served with docs/adu.html on GitHub Pages).
// Usage: node scripts/build-adu-page.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['web/adu/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'safari15', 'firefox90'],
  outfile: 'docs/adu.js',
  legalComments: 'none',
  banner: { js: '/* Bidwell AI ADU check. Built from web/adu/main.ts; do not edit. */' },
});
console.log('docs/adu.js built');
