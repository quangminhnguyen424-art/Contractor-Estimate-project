import { TRADE_NAMES } from './catalog';
import { dateFmt, money, qtyFmt } from './format';
import { planSvg, planTotals } from './floorplan';
import { estimateJob, FINISH_LABELS, qtyWithUnit } from './jobTypes';
import type { Estimate, Lang, Profile, Trade } from './types';

export const QUOTE_TEXT = {
  en: {
    quote: 'QUOTE', preparedFor: 'Prepared for', project: 'Project', scope: 'Scope of work', total: 'Total',
    subtotal: 'Subtotal', tax: 'WA sales tax', extras: 'Additional items', plan: 'Floor plan',
    planNote: 'Measured on site. Total floor area',  notIncluded: 'Not included', schedule: 'Payment schedule',
    terms: 'Terms', acceptance: 'Acceptance', owner: 'Owner', date: 'Date', validFor: 'Valid for', days: 'days',
    finish: 'Finish level', registration: 'WA contractor registration #', quoteNo: 'Quote #',
    termsLines: [
      'Changes to scope are made by written change order before the work is done.',
      'Conditions found after walls or floors are opened may require a change order.',
      'A Washington contractor disclosure statement (RCW 18.27.114) is provided with the contract.',
    ],
  },
  vi: {
    quote: 'BÁO GIÁ', preparedFor: 'Chuẩn bị cho', project: 'Dự án', scope: 'Phạm vi công việc', total: 'Tổng cộng',
    subtotal: 'Tạm tính', tax: 'Thuế bán hàng WA', extras: 'Hạng mục bổ sung', plan: 'Mặt bằng',
    planNote: 'Đo tại công trình. Tổng diện tích sàn',  notIncluded: 'Không bao gồm', schedule: 'Lịch thanh toán',
    terms: 'Điều khoản', acceptance: 'Chấp thuận', owner: 'Chủ nhà', date: 'Ngày', validFor: 'Hiệu lực', days: 'ngày',
    finish: 'Mức hoàn thiện', registration: 'Số đăng ký nhà thầu WA', quoteNo: 'Báo giá số',
    termsLines: [
      'Mọi thay đổi phạm vi được thực hiện bằng phiếu thay đổi có chữ ký trước khi thi công.',
      'Tình trạng phát hiện khi mở tường hoặc sàn có thể cần phiếu thay đổi.',
      'Bản công bố thông tin nhà thầu Washington (RCW 18.27.114) sẽ được cung cấp kèm hợp đồng.',
    ],
  },
} as const;

export interface QuoteSection {
  trade: Trade | 'extras';
  title: string;
  items: string[];
  price: number;
}

/** Client-facing sections: trade totals with markup built in. Never shows cost, labor or markup. */
export function quoteSections(est: Estimate, lang: Lang): QuoteSection[] {
  const extras = est.extras ?? [];
  const extrasTotal = extras.reduce((t, x) => t + x.price, 0);
  const extraSection: QuoteSection[] = extras.length
    ? [{ trade: 'extras', title: QUOTE_TEXT[lang].extras, price: extrasTotal,
        items: extras.map((x) => (x.unit || x.qty !== 1 ? `${x.label} (${qtyFmt(x.qty)}${x.unit ? ` ${x.unit}` : ''})` : x.label)) }]
    : [];
  if (est.mode === 'quick' || est.lines.length === 0) {
    const jt = estimateJob(est);
    const name = lang === 'vi' ? jt.vi : jt.name;
    const size = jt.unit === 'JOB' || !(est.comparison.sizeSf > 0) ? '' : ` (${qtyWithUnit(est.comparison.sizeSf, jt.unit)})`;
    return [{ trade: 'general', title: name, items: [est.scopeNote?.trim() || `${name}${size}`], price: est.price - extrasTotal }, ...extraSection];
  }
  const tradeSections: QuoteSection[] = est.trades.map((t) => ({
    trade: t.trade,
    title: TRADE_NAMES[t.trade][lang],
    items: est.lines.filter((l) => l.trade === t.trade).map((l) => {
      const label = lang === 'vi' ? l.vi : l.name;
      return l.unit === 'EA' && l.qty === 1 ? label : `${label} (${qtyFmt(l.qty)} ${l.unit})`;
    }),
    price: t.price,
  }));
  return [...tradeSections, ...extraSection];
}

/** Whole-dollar milestones; the last one takes the remainder so they always add up to the price exactly. */
export function scheduleAmounts(est: Estimate, profile: Profile) {
  const price = Math.round(est.price);
  let used = 0;
  return profile.schedule.map((s, i) => {
    const last = i === profile.schedule.length - 1;
    const amount = last ? price - used : Math.round((price * s.pct) / 100);
    used += amount;
    return { label: s.label, pct: s.pct, amount };
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML used for the PDF the client receives. */
export function quoteHtml(est: Estimate, profile: Profile, lang: Lang): string {
  const T = QUOTE_TEXT[lang];
  const jt = estimateJob(est);
  const sections = quoteSections(est, lang);
  const sched = scheduleAmounts(est, profile);
  const excl = lang === 'vi' ? jt.exclusionsVi : jt.exclusions;
  const quoteNo = est.id.slice(-6).toUpperCase();
  const row = (l: string, r: string, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${r}</td></tr>`;

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(T.quote)} ${quoteNo}</title>
<style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1B1E22;margin:36px;font-size:12px;line-height:1.45}
h1{font-size:22px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#3F444A}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C2410C;padding-bottom:12px}
.muted{color:#5B6168}.r{text-align:right;white-space:nowrap}table{width:100%;border-collapse:collapse}
td{padding:5px 0;border-bottom:1px solid #E2E0DA;vertical-align:top}.sec td{font-weight:600}
ul{margin:2px 0 6px 16px;padding:0;color:#3F444A}.tot td{font-size:15px;font-weight:700;border-bottom:none}
.sig{display:flex;gap:40px;margin-top:28px}.sig div{flex:1;border-top:1px solid #1B1E22;padding-top:4px}
</style></head><body>
<div class="top"><div><h1>${esc(profile.companyName)}</h1>
<div class="muted">${esc(profile.contactName)} · ${esc(profile.phone)} · ${esc(profile.email)}</div>
${profile.license ? `<div class="muted">${T.registration} ${esc(profile.license)}</div>` : ''}</div>
<div class="r"><div style="font-size:18px;font-weight:700">${T.quote}</div><div>${T.quoteNo} ${quoteNo}</div>
<div>${dateFmt(est.updatedAt, lang)}</div><div class="muted">${T.validFor} ${profile.quoteValidDays} ${T.days}</div></div></div>
<h2>${T.preparedFor}</h2><div><b>${esc(est.clientName || '—')}</b>${est.address ? ` · ${esc(est.address)}` : ''}</div>
<h2>${T.project}</h2><div><b>${esc(est.title)}</b> · ${T.finish}: ${FINISH_LABELS[est.finish][lang]}</div>
${est.scopeNote?.trim() ? `<div class="muted">${esc(est.scopeNote).replace(/\n/g, '<br>')}</div>` : ''}
<h2>${T.scope}</h2><table>
${sections.map((s) => `<tr class="sec"><td>${esc(s.title)}<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></td><td class="r">${money(s.price)}</td></tr>`).join('')}
${row(T.subtotal, money(est.price))}
${row(`${T.tax} (${est.salesTaxPct}%)`, money(est.tax))}
${row(T.total, money(est.total), 'tot')}
</table>
${est.plan?.length ? `<h2>${T.plan}</h2><div class="muted">${T.planNote}: ${planTotals(est.plan).floorSf} SF</div><div style="margin-top:6px">${planSvg(est.plan, 600)}</div>` : ''}
<h2>${T.notIncluded}</h2><ul>${excl.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
<h2>${T.schedule}</h2><table>${sched.map((s) => row(`${esc(s.label)} (${s.pct}%)`, money(s.amount))).join('')}</table>
<div class="muted">${lang === 'vi' ? 'Thuế bán hàng được cộng vào mỗi hóa đơn.' : 'Sales tax is added to each invoice.'}</div>
<h2>${T.terms}</h2><ul>${T.termsLines.map((t) => `<li>${t}</li>`).join('')}</ul>
<h2>${T.acceptance}</h2><div class="sig"><div>${T.owner}</div><div>${T.date}</div></div>
<div class="sig"><div>${esc(profile.companyName)}</div><div>${T.date}</div></div>
</body></html>`;
}

/** Plain material shopping list (for crew or supplier) — no client pricing. */
export function materialsHtml(est: Estimate, profile: Profile): string {
  const groups = new Map<string, typeof est.materials>();
  for (const m of est.materials) groups.set(m.category, [...(groups.get(m.category) ?? []), m]);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Materials</title><style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:32px;font-size:12px;color:#1B1E22}
h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 4px}table{width:100%;border-collapse:collapse}
td,th{padding:4px 6px;border-bottom:1px solid #E2E0DA;text-align:left}.r{text-align:right}</style></head><body>
<h1>Material list — ${esc(est.title)}</h1><div>${esc(profile.companyName)} · ${dateFmt(est.updatedAt)}</div>
${[...groups.entries()].map(([cat, rows]) => `<h2>${esc(cat)}</h2><table><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Est. price</th><th class="r">Total</th></tr>
${rows.map((m) => `<tr><td>${esc(m.name)}</td><td class="r">${m.qty}</td><td>${esc(m.unit)}</td><td class="r">$${m.unitPrice.toFixed(2)}</td><td class="r">$${m.total.toFixed(2)}</td></tr>`).join('')}</table>`).join('')}
<h2>Total before tax: ${money(est.materialTotal)}</h2></body></html>`;
}
