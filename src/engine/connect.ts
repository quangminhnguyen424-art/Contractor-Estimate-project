// Getting the contractor's data into their other apps: spreadsheets (Excel, Google Sheets), QuickBooks Online,
// their calendar, and anything else through Zapier / Make (a "webhook": the app sends each new event to a
// link the contractor pastes in).
import { contractTotals, invoiceStates, termsOf, type Contract } from './contract';
import { eventIcs, type CalEvent } from './schedule';
import type { Estimate, Profile } from './types';

/** One CSV cell: quoted when needed, and never starting like a formula (so a spreadsheet can't run it). */
export function csvCell(v: string | number | undefined | null): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: (string | number | undefined | null)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const usDate = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
};
const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** All estimates: one row each, for a spreadsheet. Client prices only (no cost or markup) unless asked. */
export function estimatesCsv(estimates: Estimate[], withCosts = false): string {
  const head = ['Date', 'Estimate', 'Client', 'Address', 'Type of work', 'Status', 'Price before tax', 'Sales tax', 'Total', ...(withCosts ? ['Your cost', 'Markup %'] : [])];
  return toCsv([head, ...estimates.map((e) => [
    usDate(e.createdAt), e.title, e.clientName, e.address, e.job?.name ?? e.jobTypeId, e.status, r2(e.price), r2(e.tax), r2(e.total),
    ...(withCosts ? [r2(e.cost), e.markupPct] : []),
  ])]);
}

/**
 * Invoices in the layout QuickBooks Online's invoice import accepts (Settings › Import data › Invoices):
 * one line per invoice, amounts before tax, with the tax rate.
 */
export function quickbooksInvoicesCsv(contracts: Contract[], estimates: Estimate[], profile: Profile): string {
  const head = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'Taxable', 'TaxRate'];
  const rows: (string | number)[][] = [];
  for (const c of contracts) {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est) continue;
    const pct = termsOf(est, profile, c).salesTaxPct;
    for (const v of [...c.invoices].sort((a, b) => a.number - b.number)) {
      rows.push([v.number, est.clientName || est.title, usDate(v.date), usDate(v.dueDate), est.title, v.itemKey.startsWith('co:') ? 'Change order' : 'Construction',
        v.label, 1, r2(v.amount), r2(v.amount), v.tax ? 'Y' : 'N', `${pct}%`]);
    }
  }
  return toCsv([head, ...rows]);
}

/** Every payment received, for bookkeeping. */
export function paymentsCsv(contracts: Contract[], estimates: Estimate[]): string {
  const rows: (string | number)[][] = [];
  for (const c of contracts) {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est) continue;
    for (const p of c.payments) rows.push([usDate(p.date), est.clientName, est.title, r2(p.amount), p.method, p.note]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv([['Date', 'Client', 'Job', 'Amount', 'Method', 'Note'], ...rows]);
}

/** Money per job: contract, change orders, paid, still owed. */
export function jobsMoneyCsv(contracts: Contract[], estimates: Estimate[], profile: Profile, today: string): string {
  const rows = contracts.flatMap((c) => {
    const est = estimates.find((e) => e.id === c.estimateId);
    if (!est) return [];
    const t = contractTotals(est, profile, c);
    const overdue = Object.values(invoiceStates(c, today, termsOf(est, profile, c).salesTaxPct)).filter((s) => s.state === 'overdue').length;
    return [[est.title, est.clientName, c.accepted ? usDate(c.accepted.signedAt) : '', r2(t.original), r2(t.changesWithTax), r2(t.total), r2(t.paid), r2(t.balance), overdue]];
  });
  return toCsv([['Job', 'Client', 'Signed', 'Original (with tax)', 'Change orders (with tax)', 'Contract total', 'Paid', 'Balance', 'Overdue invoices'], ...rows]);
}

/** All upcoming appointments as one calendar file (Google Calendar, Outlook and iPhone Calendar can import it). */
export function calendarIcs(events: CalEvent[], today: string, company: string): string {
  const parts = events.filter((e) => e.date >= today && !e.done).map((e) => eventIcs(e, company));
  if (!parts.length) return '';
  // Merge the single-event files into one calendar.
  const inner = parts.map((p) => p.slice(p.indexOf('BEGIN:VEVENT'), p.indexOf('END:VCALENDAR')).trim());
  const head = parts[0].slice(0, parts[0].indexOf('BEGIN:VEVENT'));
  return `${head}${inner.join('\r\n')}\r\nEND:VCALENDAR`;
}

// ---- Webhook (Zapier, Make, n8n, Google Apps Script…) ----

export type HookEvent = 'estimate.sent' | 'estimate.won' | 'quote.signed' | 'change.approved' | 'invoice.created' | 'payment.recorded' | 'test';

export const HOOK_EVENTS: { id: Exclude<HookEvent, 'test'>; label: string }[] = [
  { id: 'estimate.sent', label: 'Quote sent' },
  { id: 'estimate.won', label: 'Job won' },
  { id: 'quote.signed', label: 'Client signed' },
  { id: 'change.approved', label: 'Change order signed' },
  { id: 'invoice.created', label: 'Invoice made' },
  { id: 'payment.recorded', label: 'Payment received' },
];

export interface Connections {
  webhookUrl: string;
  events: Exclude<HookEvent, 'test'>[];
  /** Also send internal numbers (cost, markup). Off by default: these are private. */
  includeCosts: boolean;
}

export const NO_CONNECTIONS: Connections = { webhookUrl: '', events: HOOK_EVENTS.map((e) => e.id), includeCosts: false };

/** Only secure web addresses, and not addresses inside the phone's own network. */
export function validHookUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return !(h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]');
  } catch {
    return false;
  }
}

/** The job summary sent with each event. Client price and totals only, unless the contractor turned costs on. */
export function estimatePayload(e: Estimate, includeCosts: boolean) {
  return {
    id: e.id, title: e.title, client: e.clientName, address: e.address, typeOfWork: e.job?.name ?? e.jobTypeId, status: e.status,
    price: e.price, salesTax: e.tax, total: e.total, createdAt: e.createdAt,
    ...(includeCosts ? { cost: e.cost, labor: e.laborTotal, materials: e.materialTotal, markupPct: e.markupPct } : {}),
  };
}

export function hookBody(event: HookEvent, data: Record<string, unknown>, company: string) {
  return { app: 'Bidwell AI', event, sentAt: new Date().toISOString(), company, data };
}

/** Sample data for the "Send a test" button, so the contractor can set up their Zap or scenario. */
export const SAMPLE_HOOK_DATA = {
  estimate: { id: 'sample', title: 'Sample — Hall bath remodel', client: 'Sample Client', address: '123 Example St', typeOfWork: 'Bathroom remodel', status: 'sent', price: 15000, salesTax: 1500, total: 16500, createdAt: '2026-01-01T12:00:00Z' },
};
