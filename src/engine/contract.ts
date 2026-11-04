// After the client says yes: their signature on the quote, change orders, invoices and payments for one job.
// Amounts follow the quote: milestone and change-order amounts are before tax, and sales tax is added on each invoice.
import { dateFmt, money } from './format';
import { scheduleAmounts } from './quote';
import type { Estimate, Lang, Profile } from './types';

/** A signature drawn with a finger: each stroke is a list of x,y pairs in the pad's own w × h space. */
export interface Signature {
  name: string;
  strokes: number[][];
  w: number;
  h: number;
  signedAt: string;
}

export type ChangeStatus = 'pending' | 'approved' | 'declined';

export interface ChangeOrder {
  id: string;
  number: number;
  title: string;
  description: string;
  /** Price before tax; negative for a credit (work removed). */
  amount: number;
  status: ChangeStatus;
  createdAt: string;
  decidedAt?: string;
  signature?: Signature;
}

export type PayMethod = 'check' | 'cash' | 'zelle' | 'card' | 'transfer' | 'other';

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  method: PayMethod;
  note: string;
}

export interface Invoice {
  id: string;
  number: number;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  /** What it bills: "m0", "m1"… for payment schedule steps, "co:<id>" for a change order. */
  itemKey: string;
  label: string;
  amount: number; // before tax
  tax: number;
}

/** The money terms the client agreed to, frozen when they signed (or when the first invoice was made). */
export interface Terms {
  price: number; // before tax
  salesTaxPct: number;
  /** Total with tax as shown on the quote they signed. */
  total: number;
  schedule: { label: string; pct: number; amount: number }[];
}

export interface Contract {
  estimateId: string;
  /** The client's acceptance of the quote, with the total they agreed to and the signed quote itself. */
  accepted?: Signature & { total: number; html?: Partial<Record<Lang, string>> };
  /** Frozen terms: later edits to the estimate or the payment schedule in Settings never change a running job. */
  terms?: Terms;
  changeOrders: ChangeOrder[];
  invoices: Invoice[];
  payments: Payment[];
}

export const emptyContract = (estimateId: string): Contract => ({ estimateId, changeOrders: [], invoices: [], payments: [] });

const r2 = (n: number) => Math.round(n * 100) / 100;
export const taxOn = (amount: number, pct: number) => r2((amount * pct) / 100);

/** The terms from the estimate as it is now (used to freeze them at signing / first invoice). */
export const termsFrom = (est: Estimate, profile: Profile): Terms => ({
  price: est.price, salesTaxPct: est.salesTaxPct, total: est.total, schedule: scheduleAmounts(est, profile),
});

/** The terms in force: the frozen ones, or (before anything was signed or billed) the estimate as it is now. */
export const termsOf = (est: Estimate, profile: Profile, c: Contract): Terms => c.terms ?? termsFrom(est, profile);

export interface BillItem {
  key: string;
  label: string;
  amount: number; // before tax; negative for a credit
  tax: number;
  credit: boolean;
  invoice?: Invoice;
}

/**
 * What the job is billed for: the payment schedule, then each approved change order. Credits (work removed) are
 * not invoiced on their own: they lower the contract total and count as already paid.
 */
export function billItems(est: Estimate, profile: Profile, c: Contract): BillItem[] {
  const t = termsOf(est, profile, c);
  const sched = t.schedule.map((s, i) => ({ key: `m${i}`, label: `${s.label} (${s.pct}%)`, amount: s.amount }));
  const cos = c.changeOrders.filter((x) => x.status === 'approved').map((x) => ({ key: `co:${x.id}`, label: `Change order #${x.number}: ${x.title}`, amount: x.amount }));
  return [...sched, ...cos].map((x) => ({ ...x, tax: taxOn(x.amount, t.salesTaxPct), credit: x.amount < 0, invoice: c.invoices.find((v) => v.itemKey === x.key) }));
}

/**
 * The money picture for the job. Tax is the sum of the tax on each billed item, so that when every invoice is
 * paid the balance is exactly zero (no stray cents).
 */
export function contractTotals(est: Estimate, profile: Profile, c: Contract) {
  const t = termsOf(est, profile, c);
  const items = billItems(est, profile, c);
  const sched = items.filter((i) => i.key.startsWith('m'));
  const cos = items.filter((i) => i.key.startsWith('co:'));
  const original = r2(sched.reduce((s, i) => s + i.amount + i.tax, 0));
  const changes = r2(cos.reduce((s, i) => s + i.amount, 0));
  const changesWithTax = r2(cos.reduce((s, i) => s + i.amount + i.tax, 0));
  const total = r2(original + changesWithTax);
  const credits = r2(-cos.filter((i) => i.credit).reduce((s, i) => s + i.amount + i.tax, 0));
  const paid = r2(c.payments.reduce((s, p) => s + p.amount, 0));
  const invoiced = r2(c.invoices.reduce((s, v) => s + v.amount + v.tax, 0));
  return {
    original, changes, changesWithTax, price: r2(t.price + changes), total, paid, invoiced, credits,
    balance: r2(total - paid),
    /** Billed but not yet paid (credits count as paid). Never more than what's left on the contract. */
    due: r2(Math.max(0, Math.min(invoiced - paid - credits, total - paid))),
    pending: c.changeOrders.filter((x) => x.status === 'pending').length,
  };
}

export type InvoiceState = 'paid' | 'partial' | 'open' | 'overdue';

/** Which invoices are paid: payments (and credits) are applied to invoices oldest first. */
export function invoiceStates(c: Contract, today: string, salesTaxPct = 0): Record<string, { state: InvoiceState; paid: number }> {
  const credits = c.changeOrders.filter((x) => x.status === 'approved' && x.amount < 0).reduce((t, x) => t - x.amount - taxOn(x.amount, salesTaxPct), 0);
  let pool = c.payments.reduce((t, p) => t + p.amount, 0) + credits;
  const out: Record<string, { state: InvoiceState; paid: number }> = {};
  for (const v of [...c.invoices].sort((a, b) => a.number - b.number)) {
    const owed = r2(v.amount + v.tax);
    if (owed <= 0) { out[v.id] = { paid: 0, state: 'paid' }; continue; }
    const paid = r2(Math.min(owed, Math.max(0, pool)));
    pool -= paid;
    out[v.id] = { paid, state: paid >= owed - 0.004 ? 'paid' : paid > 0 ? 'partial' : v.dueDate < today ? 'overdue' : 'open' };
  }
  return out;
}

/** Invoice numbers never repeat: one past the highest ever issued (kept even when a job is deleted). */
export const nextInvoiceNo = (all: Contract[], lastIssued = 1000) =>
  1 + Math.max(lastIssued, 1000, ...all.flatMap((c) => c.invoices.map((v) => v.number)));
export const nextChangeNo = (c: Contract) => 1 + c.changeOrders.reduce((m, x) => Math.max(m, x.number), 0);

/** True when the quote was changed after the client signed it (the PDF they signed no longer matches). */
export const changedSinceSigned = (est: Estimate, c?: Contract) => !!c?.accepted && Math.abs(c.accepted.total - est.total) > 0.5;

// ---- Signatures as pictures ----

/** Smooth SVG path for one stroke. */
function strokePath(pts: number[]): string {
  if (pts.length < 2) return '';
  if (pts.length < 6) return `M${pts[0]} ${pts[1]} L${pts[2] ?? pts[0] + 0.5} ${pts[3] ?? pts[1] + 0.5}`;
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
    d += ` Q${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return `${d} L${pts[pts.length - 2].toFixed(1)} ${pts[pts.length - 1].toFixed(1)}`;
}

export function signatureSvg(sig: Pick<Signature, 'strokes' | 'w' | 'h'>, color = '#1B1E22'): string {
  const paths = sig.strokes.filter((s) => s.length >= 2 && s.every(Number.isFinite)).map((s) => `<path d="${strokePath(s)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sig.w} ${sig.h}" width="100%" preserveAspectRatio="xMinYMid meet"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

/** Enough ink to count as a signature (not a stray tap). */
export const hasInk = (strokes: number[][]) => strokes.reduce((t, s) => t + s.length / 2, 0) >= 12;

// ---- Documents for the client ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money2 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DOC_CSS = `body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1B1E22;margin:36px;font-size:12px;line-height:1.45}
h1{font-size:22px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#3F444A}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #EAB308;padding-bottom:12px}
.muted{color:#5B6168}.r{text-align:right;white-space:nowrap}table{width:100%;border-collapse:collapse}
td{padding:6px 0;border-bottom:1px solid #E2E0DA;vertical-align:top}.tot td{font-size:15px;font-weight:700;border-bottom:none}
.box{background:#F7F7F4;border-radius:8px;padding:12px 14px;margin-top:8px}.sig{display:flex;gap:40px;margin-top:26px}
.sig>div{flex:1;border-top:1px solid #1B1E22;padding-top:4px}.sigimg{height:70px;margin-bottom:-8px}.sigimg svg{height:70px}`;

const L = {
  en: {
    invoice: 'Invoice', no: 'No.', date: 'Date', due: 'Due', billTo: 'Bill to', job: 'Project', item: 'Description', amount: 'Amount',
    tax: 'Sales tax', thisInvoice: 'Amount due', summary: 'Contract summary', original: 'Original contract (with tax)',
    changes: 'Approved change orders (with tax)', revised: 'Contract total', paidToDate: 'Paid to date', balance: 'Balance remaining', credits: 'Credits (work removed)',
    payable: 'Please make payment to', thanks: 'Thank you for your business.', co: 'Change order', reason: 'Change', price: 'Price change',
    newTotal: 'New contract total (with tax)', approve: 'Approved by owner', contractor: 'Contractor', accepted: 'Accepted',
    coNote: 'This change becomes part of the contract when signed by both parties. All other terms stay the same.',
  },
  vi: {
    invoice: 'Hóa đơn', no: 'Số', date: 'Ngày', due: 'Hạn trả', billTo: 'Gửi đến', job: 'Công trình', item: 'Nội dung', amount: 'Số tiền',
    tax: 'Thuế bán hàng', thisInvoice: 'Số tiền cần trả', summary: 'Tóm tắt hợp đồng', original: 'Hợp đồng ban đầu (gồm thuế)',
    changes: 'Phát sinh đã duyệt (gồm thuế)', revised: 'Tổng hợp đồng', paidToDate: 'Đã trả', balance: 'Còn lại', credits: 'Giảm trừ (bớt việc)',
    payable: 'Vui lòng thanh toán cho', thanks: 'Cảm ơn quý khách.', co: 'Phát sinh', reason: 'Thay đổi', price: 'Thay đổi giá',
    newTotal: 'Tổng hợp đồng mới (gồm thuế)', approve: 'Chủ nhà duyệt', contractor: 'Nhà thầu', accepted: 'Đã chấp nhận',
    coNote: 'Thay đổi này là một phần của hợp đồng khi hai bên đã ký. Các điều khoản khác giữ nguyên.',
  },
};

const header = (profile: Profile, title: string, right: string) => `<div class="top"><div><h1>${esc(profile.companyName)}</h1>
<div class="muted">${[profile.contactName, profile.phone, profile.email].filter(Boolean).map(esc).join(' · ')}</div>
${profile.license ? `<div class="muted">WA Reg. ${esc(profile.license)}</div>` : ''}</div>
<div class="r"><div style="font-size:18px;font-weight:700">${title}</div>${right}</div></div>`;

const day = (ymd: string, lang: Lang) => dateFmt(`${ymd}T12:00:00`, lang);

export function invoiceHtml(est: Estimate, profile: Profile, c: Contract, inv: Invoice, lang: Lang): string {
  const T = L[lang];
  const t = contractTotals(est, profile, c);
  const pct = termsOf(est, profile, c).salesTaxPct;
  const owed = r2(inv.amount + inv.tax);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${T.invoice} ${inv.number}</title><style>${DOC_CSS}</style></head><body>
${header(profile, T.invoice, `<div>${T.no} ${inv.number}</div><div>${T.date}: ${day(inv.date, lang)}</div><div><b>${T.due}: ${day(inv.dueDate, lang)}</b></div>`)}
<h2>${T.billTo}</h2><div><b>${esc(est.clientName || '—')}</b>${est.address ? `<br>${esc(est.address)}` : ''}</div>
<h2>${T.job}</h2><div>${esc(est.title)}</div>
<h2>${T.item}</h2><table>
<tr><td>${esc(inv.label)}</td><td class="r">${money2(inv.amount)}</td></tr>
<tr><td>${T.tax} (${pct}%)</td><td class="r">${money2(inv.tax)}</td></tr>
<tr class="tot"><td>${T.thisInvoice}</td><td class="r">${money2(owed)}</td></tr></table>
<h2>${T.summary}</h2><div class="box"><table>
<tr><td>${T.original}</td><td class="r">${money2(t.original)}</td></tr>
${t.changes ? `<tr><td>${T.changes}</td><td class="r">${money2(t.changesWithTax)}</td></tr>` : ''}
<tr><td><b>${T.revised}</b></td><td class="r"><b>${money2(t.total)}</b></td></tr>
<tr><td>${T.paidToDate}</td><td class="r">${money2(t.paid)}</td></tr>
<tr><td><b>${T.balance}</b></td><td class="r"><b>${money2(t.balance)}</b></td></tr>
</table></div>
<p>${T.payable} <b>${esc(profile.companyName)}</b>. ${T.thanks}</p></body></html>`;
}

export function changeOrderHtml(est: Estimate, profile: Profile, c: Contract, co: ChangeOrder, lang: Lang): string {
  const T = L[lang];
  const pct = termsOf(est, profile, c).salesTaxPct;
  // Contract total if this change is approved (or as approved), counted the same way as the invoices.
  const withThis: Contract = { ...c, changeOrders: [...c.changeOrders.filter((x) => x.id !== co.id), ...(co.status === 'declined' ? [] : [{ ...co, status: 'approved' as const }])] };
  const newTotal = contractTotals(est, profile, withThis).total;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${T.co} #${co.number}</title><style>${DOC_CSS}</style></head><body>
${header(profile, `${T.co} #${co.number}`, `<div>${T.date}: ${dateFmt(co.createdAt, lang)}</div>`)}
<h2>${T.job}</h2><div><b>${esc(est.title)}</b><br>${esc(est.clientName || '')}${est.address ? ` · ${esc(est.address)}` : ''}</div>
<h2>${T.reason}</h2><div><b>${esc(co.title)}</b></div>${co.description.trim() ? `<div>${esc(co.description).replace(/\n/g, '<br>')}</div>` : ''}
<table style="margin-top:12px">
<tr><td>${T.price}</td><td class="r">${money2(co.amount)}</td></tr>
<tr><td>${T.tax} (${pct}%)</td><td class="r">${money2(taxOn(co.amount, pct))}</td></tr>
<tr class="tot"><td>${T.newTotal}</td><td class="r">${money2(newTotal)}</td></tr></table>
<p class="muted">${T.coNote}</p>
<div class="sig"><div>${co.signature ? `<div class="sigimg">${signatureSvg(co.signature)}</div>` : ''}${T.approve}${co.signature ? `: ${esc(co.signature.name)} · ${dateFmt(co.signature.signedAt, lang)}` : ''}</div>
<div>${T.contractor}: ${esc(profile.companyName)}</div></div></body></html>`;
}

/** The acceptance block for a signed quote (replaces the blank signature lines). */
export function acceptedBlock(sig: Signature & { total: number }, profile: Profile, lang: Lang): string {
  const T = L[lang];
  return `<div class="sig"><div><div style="height:70px">${signatureSvg(sig)}</div>${T.accepted}: <b>${esc(sig.name)}</b> · ${dateFmt(sig.signedAt, lang)} · ${money(sig.total)}</div>
<div><div style="height:70px"></div>${esc(profile.companyName)}</div></div>`;
}
