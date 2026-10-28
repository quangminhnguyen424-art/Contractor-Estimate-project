// Builds the web version as ONE self-contained HTML file (scripts, icons and fonts inlined),
// so it can be opened from any link or file without a server.
// Usage: npm run build:web-single   ->  dist-single/estimator.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = 'dist-single/export';
fs.rmSync('dist-single', { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir ${out}`, {
  stdio: 'inherit',
  env: { ...process.env, WEB_SINGLE: '1', CI: '1' },
});

const jsDir = path.join(out, '_expo/static/js/web');
const bundles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) throw new Error(`Expected one bundle, found ${bundles.length}`);
let js = fs.readFileSync(path.join(jsDir, bundles[0]), 'utf8');

const mime = { '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.jpg': 'image/jpeg' };
for (const ref of new Set(js.match(/"\/assets\/[^"]+"/g) ?? [])) {
  const rel = ref.slice(1, -1);
  const file = path.join(out, rel);
  if (!fs.existsSync(file)) continue;
  const data = fs.readFileSync(file).toString('base64');
  js = js.split(ref).join(`"data:${mime[path.extname(file)] ?? 'application/octet-stream'};base64,${data}"`);
}

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
  .replace(/<link rel="icon"[^>]*\/>/, '')
  .replace(/<script src="[^"]+" defer><\/script>/g, '');
const boot = `<script>
// Start the app's router at "/" wherever this page is hosted.
try { if (location.pathname !== '/') history.replaceState(null, '', '/' + location.search); } catch (e) {}
</script>
`;
// Use a function so "$&"-style patterns inside the bundle are not treated as replacement codes.
const inline = `${boot}<script>\n${js.replace(/<\/script/g, () => '<\\/script')}\n</script>\n</body>`;
html = html.replace('</body>', () => inline);
fs.writeFileSync('dist-single/estimator.html', html);
console.log(`dist-single/estimator.html (${Math.round(html.length / 1024)} KB)`);
