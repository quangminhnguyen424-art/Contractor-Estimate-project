// Builds the web app for testers into docs/app/, served at <site>/app/ next to the public pages.
// Any address inside the app (an estimate, a job) can be opened or reloaded: GitHub Pages and
// Cloudflare Pages serve docs/404.html for unknown paths, and that page is the app itself.
// Usage: node scripts/build-web-hosted.mjs [/Contractor-Estimate-project/app]
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.argv[2] ?? '/Contractor-Estimate-project/app';
const out = 'docs/app';
fs.rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir ${out}`, {
  stdio: 'inherit',
  env: { ...process.env, WEB_BASE: base, CI: '1' },
});
fs.copyFileSync(`${out}/index.html`, 'docs/404.html');
console.log(`web app in ${out}, served at ${base}/`);
