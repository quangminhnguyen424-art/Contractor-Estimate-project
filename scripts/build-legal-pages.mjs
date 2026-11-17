// Builds the public legal and contact pages from the same text the app uses:
//   docs/privacy.html, docs/terms.html, docs/support.html, docs/delete-account.html (and copies in public/)
// Contact details come from src/engine/company.ts, the Terms from src/engine/legal.ts, the policy from src/engine/privacy.ts.
// Usage: node scripts/build-legal-pages.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'legal-'));
const out = path.join(dir, 'legal.mjs');
await build({
  stdin: { contents: "export * from './src/engine/company'; export * from './src/engine/legal'; export * from './src/engine/privacy';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const L = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });
const { COMPANY, TERMS, TERMS_VERSION, PRIVACY_POLICY, PRIVACY_VERSION } = L;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Email addresses and the site become links.
const linkify = (s) => esc(s)
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+\w/g, (m) => `<a href="mailto:${m}">${m}</a>`);

const NAV = [['support.html', 'Contact'], ['privacy.html', 'Privacy'], ['terms.html', 'Terms'], ['help.html', 'Help'], ['delete-account.html', 'Delete account']];

function page({ file, title, description, vi, body }) {
  const nav = NAV.map(([f, t]) => `<a href="./${f}"${f === file ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(COMPANY.brand)}</title>
<meta name="description" content="${esc(description)}">
<style>
:root{--bg:#F5F7FB;--card:#fff;--ink:#0B1324;--ink2:#3B4659;--muted:#4F5A6B;--line:#DCE3EC;--accent:#2457F5;--tint:rgba(36,87,245,.10)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
header{background:rgba(245,247,251,.94);border-bottom:1px solid var(--line);position:sticky;top:0;backdrop-filter:blur(10px)}
.bar{max-width:760px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.logo{width:32px;height:32px;border-radius:9px;overflow:hidden;display:flex}
.brand{font-weight:700;margin-right:auto}nav{display:flex;gap:4px;flex-wrap:wrap}
nav a{color:var(--muted);text-decoration:none;font-size:14px;padding:6px 10px;border-radius:999px}nav a[aria-current]{background:var(--tint);color:var(--accent);font-weight:600}
main{max-width:760px;margin:0 auto;padding:28px 16px 56px}h1{font-size:30px;line-height:1.2;margin:0 0 4px;letter-spacing:-.4px}
.meta{color:var(--muted);font-size:14px;margin:0 0 20px}.vi{background:var(--tint);border-radius:14px;padding:14px 16px;color:var(--ink2);font-size:15px;margin:0 0 20px}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:0 0 12px}h2{font-size:18px;margin:0 0 8px}
p{color:var(--ink2);margin:0 0 10px}p:last-child{margin-bottom:0}a{color:var(--accent)}
.big{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}.big a{flex:1;min-width:160px;text-align:center;padding:14px;border-radius:14px;background:var(--accent);color:#fff;font-weight:700;text-decoration:none}
.big a.alt{background:var(--card);color:var(--accent);border:1px solid var(--line)}
footer{color:var(--muted);font-size:13px;text-align:center;padding:0 16px 32px}
</style></head><body>
<header><div class="bar"><div class="logo" aria-hidden="true"><svg viewBox="0 0 1024 1024" width="100%" height="100%" aria-hidden="true"><rect width="1024" height="1024" fill="#2457F5"/><g fill="#fff"><rect x="212" y="236" width="600" height="72" rx="22"/><rect x="212" y="716" width="600" height="72" rx="22"/><rect x="236" y="296" width="72" height="432" rx="14"/><rect x="716" y="296" width="72" height="432" rx="14"/></g><polyline points="372,524 472,620 650,384" fill="none" stroke="#FF8A3D" stroke-width="76" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="brand">${esc(COMPANY.brand)}</div><nav>${nav}</nav></div></header>
<main>
<h1>${esc(title)}</h1>
${body.meta ? `<p class="meta">${body.meta}</p>` : ''}
${vi ? `<p class="vi" lang="vi">${vi}</p>` : ''}
${body.html}
</main>
<footer>${esc(COMPANY.brand)} is a trade name of ${esc(COMPANY.legalName)}, ${esc(COMPANY.city)}.${COMPANY.mail ? ` ${esc(COMPANY.mail)}.` : ''}</footer>
</body></html>
`;
  for (const d of ['docs', 'public']) writeFileSync(path.join(d, file), html);
  return file;
}

const sections = (list) => list.map((s) => `<section><h2>${esc(s.title)}</h2>${(Array.isArray(s.body) ? s.body : [s.body]).map((p) => `<p>${linkify(p)}</p>`).join('')}</section>`).join('\n');
const phoneLink = COMPANY.phone ? `<a href="tel:${COMPANY.phone.replace(/[^\d+]/g, '')}">${esc(COMPANY.phone)}</a>` : '';

const made = [
  page({
    file: 'privacy.html', title: 'Privacy Policy',
    description: `How ${COMPANY.brand} collects, uses and protects information.`,
    vi: `Tóm tắt: Chúng tôi chỉ dùng thông tin bạn nhập để chạy app cho bạn. Không bán dữ liệu, không quảng cáo. Khi bật AI, nội dung cần thiết được gửi tới Anthropic và không được dùng để huấn luyện AI. Bạn có thể xuất dữ liệu hoặc xóa tài khoản bất cứ lúc nào. Liên hệ: ${linkify(COMPANY.privacy)}. Bản tiếng Anh dưới đây là bản chính thức.`,
    body: { meta: `Effective ${PRIVACY_VERSION}`, html: sections(PRIVACY_POLICY) },
  }),
  page({
    file: 'terms.html', title: 'Terms of Use',
    description: `The terms for using ${COMPANY.brand}.`,
    vi: `Tóm tắt: App dành cho nhà thầu từ 18 tuổi. AI có thể sai: bạn phải kiểm tra mọi báo giá, tài liệu trước khi dùng. Bạn chịu trách nhiệm về license, permit, hợp đồng và thuế của mình. Dữ liệu là của bạn. Bản tiếng Anh dưới đây là bản chính thức.`,
    body: { meta: `Version ${TERMS_VERSION}`, html: sections(TERMS) },
  }),
  page({
    file: 'support.html', title: 'Contact and support',
    description: `How to reach ${COMPANY.brand} support.`,
    vi: `Cần giúp đỡ? Gửi email tới ${linkify(COMPANY.support)}${phoneLink ? ` hoặc gọi ${phoneLink}` : ''}. Chúng tôi trả lời trong 1 ngày làm việc. Trong app: Tôi → Trợ giúp → Báo lỗi.`,
    body: {
      html: `
<section><h2>Contractors using the app</h2>
<p>Email <a href="mailto:${COMPANY.support}?subject=${encodeURIComponent(`${COMPANY.brand} help`)}">${esc(COMPANY.support)}</a>${phoneLink ? ` or call ${phoneLink} (Monday to Friday, 9 am to 5 pm Pacific)` : ''}. We answer within one business day.</p>
<p>In the app: Me → Help and support → Report a problem sends us the details we need, with a screenshot if you add one.</p>
<div class="big"><a href="mailto:${COMPANY.support}?subject=${encodeURIComponent(`${COMPANY.brand} help`)}">Email support</a><a class="alt" href="./help.html">Help center</a></div></section>
<section><h2>Clients and homeowners</h2>
<p>If a contractor sent you a quote, a signing link or a report, contact that contractor about your project: their phone and email are on the page they sent. For questions about how ${esc(COMPANY.brand)} handles your information, write to ${linkify(COMPANY.privacy)}.</p></section>
<section><h2>Billing</h2><p>${linkify(COMPANY.billing)}. Subscriptions bought through the App Store or Google Play are managed and refunded by Apple or Google in your phone’s settings.</p></section>
<section><h2>Privacy and legal</h2><p>Privacy requests: ${linkify(COMPANY.privacy)}. Legal notices: ${linkify(COMPANY.legal)}${COMPANY.mail ? `, or by mail to ${esc(COMPANY.legalName)}, ${esc(COMPANY.mail)}` : ''}.</p></section>
<section><h2>Company</h2><p>${esc(COMPANY.brand)} is made by ${esc(COMPANY.legalName)}, a ${esc(COMPANY.state)} limited liability company, ${esc(COMPANY.city)}.</p></section>`,
    },
  }),
  page({
    file: 'delete-account.html', title: 'Delete your account',
    description: `How to delete a ${COMPANY.brand} account and what is deleted.`,
    vi: `Xóa tài khoản trong app: Tôi → tài khoản (email của bạn ở trên cùng) → Xóa tài khoản. Không mở được app? Gửi email từ địa chỉ đăng nhập tới ${linkify(COMPANY.privacy)} với tiêu đề "Delete my account". Mọi dữ liệu trên cloud bị xóa vĩnh viễn; bản sao lưu bị xóa trong 30 ngày.`,
    body: {
      html: `
<section><h2>In the app (fastest)</h2><p>Open ${esc(COMPANY.brand)}, go to <b>Me → your account (your email at the top) → Delete my account</b>, and confirm. The account is deleted right away.</p></section>
<section><h2>Without the app</h2><p>Email <a href="mailto:${COMPANY.privacy}?subject=${encodeURIComponent('Delete my account')}">${esc(COMPANY.privacy)}</a> from the email address you sign in with, with the subject “Delete my account”. We confirm it is you and delete the account within 7 days.</p>
<div class="big"><a href="mailto:${COMPANY.privacy}?subject=${encodeURIComponent('Delete my account')}">Ask to delete my account</a></div></section>
<section><h2>What is deleted</h2><p>Your sign-in, your saved work (estimates, quotes, contracts, invoices, job sites, schedules, prices, notes), photos and receipts, client signing records, ADU leads, support history and AI usage counts. Copies in our backups are removed within 30 days.</p>
<p>What stays: documents you already sent to clients (they keep their copies), and records we must keep by law, such as payment records for paid plans.</p>
<p>Work saved only on your phone stays on that phone until you delete the app. Export a copy first if you want one: Me → Backup.</p></section>`,
    },
  }),
];

console.log(`legal pages: ${made.join(', ')}`);
