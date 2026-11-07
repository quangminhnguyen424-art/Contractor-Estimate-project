// Builds the public Help Center page (docs/help.html, served by GitHub Pages) from the same how-to topics the app uses.
import { readFileSync, writeFileSync } from 'node:fs';

const topics = JSON.parse(readFileSync(new URL('../src/engine/help.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const items = topics.map((t) => `<details id="${t.id}"><summary>${esc(t.title)} <span class="vi">${esc(t.vi)}</span></summary><p>${esc(t.answer)}</p></details>`).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Help Center · Bidwell AI</title>
<style>
:root{--bg:#F5F7FB;--card:#fff;--ink:#0B1324;--ink2:#3B4659;--muted:#4F5A6B;--line:#DCE3EC;--accent:#2457F5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:40px 16px 64px}h1{font-size:30px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
input{width:100%;height:50px;border:1px solid var(--line);border-radius:14px;padding:0 16px;font:inherit;margin-bottom:16px}
details{background:var(--card);border:1px solid var(--line);border-radius:16px;margin-bottom:10px;padding:14px 16px}
summary{font-weight:600;cursor:pointer}.vi{color:var(--muted);font-weight:400;font-size:14px;margin-left:6px}p{color:var(--ink2);margin:10px 0 2px}
.contact{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:24px}a{color:var(--accent)}
</style></head><body><div class="wrap">
<h1>Bidwell AI Help Center</h1><p class="sub">How-to guides for contractors. In the app, tap the <b>?</b> on Home to chat with Bidwell AI.</p>
<input id="q" placeholder="Search: password, roof, sign, photos…" aria-label="Search help">
${items}
<div class="contact"><b>Still need help?</b><p>Email <a href="mailto:${'justin.ngminh@gmail.com'}">justin.ngminh@gmail.com</a> or use <b>Report a problem</b> in the app (Settings → Help &amp; support). We reply within one business day.</p>
<p><small>Bidwell AI is made by YM LLC, Federal Way, Washington.</small></p></div>
</div>
<script>
const q=document.getElementById('q');q.addEventListener('input',()=>{const t=q.value.toLowerCase();document.querySelectorAll('details').forEach(d=>{d.style.display=d.textContent.toLowerCase().includes(t)?'':'none';});});
if(location.hash){const d=document.querySelector(location.hash);if(d)d.open=true;}
</script></body></html>
`;
writeFileSync(new URL('../docs/help.html', import.meta.url), html);
console.log(`docs/help.html: ${topics.length} topics`);
