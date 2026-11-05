// A job's money, like the contractor's Project Dashboard sheet: contract price, cost to date, profit, the owner's
// deposits and what's left to spend, what the owner still owes (and what is overdue), and taxes set aside.
// Plus the buy list (from the estimate), receipts read by AI, and the price lessons each receipt teaches.

import { contractTotals, invoiceStates, termsOf, type Contract } from './contract';
import type { Estimate, Profile } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));

export type CostKind = 'labor' | 'materials' | 'subs' | 'equipment';

export const COST_KINDS: Record<CostKind, { en: string; vi: string; icon: string }> = {
  labor: { en: 'Labor (loaded)', vi: 'Nhân công', icon: 'people-outline' },
  materials: { en: 'Materials (with tax)', vi: 'Vật tư (gồm thuế)', icon: 'cube-outline' },
  subs: { en: 'Subcontractors', vi: 'Thầu phụ', icon: 'construct-outline' },
  equipment: { en: 'Equipment & rentals', vi: 'Thiết bị & thuê', icon: 'car-outline' },
};
export const KIND_ORDER: CostKind[] = ['labor', 'materials', 'subs', 'equipment'];

/** One line read off a receipt. `buyId` links it to the buy list item it paid for. */
export interface ReceiptLine { name: string; qty: number; unit: string; total: number; buyId?: string }

export interface CostEntry {
  id: string;
  date: string; // YYYY-MM-DD
  kind: CostKind;
  vendor: string;
  note: string;
  /** What was paid, tax included. */
  amount: number;
  receiptUri?: string;
  lines?: ReceiptLine[];
  /** Paid by the contractor for the owner, to be paid back by this date (owner reimbursement). */
  ownerOwes?: { due: string; paidOn?: string };
  /** Labor from a crew day: who, and which calendar day. */
  memberId?: string;
  eventId?: string;
  createdAt: string;
}

export interface BuyItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  /** Planned cost from the estimate (or typed in). */
  estCost: number;
  bought: boolean;
  /** What receipts say was paid for it. */
  spent?: number;
  source: 'estimate' | 'added';
}

export interface ProjectMoney {
  /** Sales tax rate for this job site's address; null = use the estimate's rate. */
  salesTaxPct: number | null;
  /** Share of profit set aside for income tax (the contractor's own choice). */
  incomeTaxPct: number;
  costs: CostEntry[];
  buy: BuyItem[];
}

export const emptyMoney = (): ProjectMoney => ({ salesTaxPct: null, incomeTaxPct: 30, costs: [], buy: [] });

export type FundsStatus = 'none' | 'ok' | 'low' | 'request';

export interface Books {
  contract: { base: number; changes: number; price: number };
  cost: Record<CostKind, number> & { total: number };
  budget: Record<CostKind, number>;
  /** Kinds over budget by more than 5%, with how much over (percent). */
  over: { kind: CostKind; pct: number; amount: number }[];
  profit: { amount: number; marginPct: number };
  funds: { deposited: number; spent: number; spendable: number; status: FundsStatus };
  owner: { owes: number; received: number; balance: number; overdueCount: number; overdueAmount: number };
  tax: { salesPct: number; sales: number; incomePct: number; income: number; reserve: number; netAfterTax: number; netMarginPct: number };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** All the numbers on the project dashboard. Works with or without a linked estimate/contract. */
export function projectBooks(input: { est?: Estimate; profile?: Profile | null; contract?: Contract; money: ProjectMoney; today: string }): Books {
  const { est, profile, contract, money, today } = input;
  const ct = est && profile && contract ? contractTotals(est, profile, contract) : null;
  const base = est && profile && contract ? termsOf(est, profile, contract).price : est?.price ?? 0;
  const changes = ct?.changes ?? 0;
  const price = r2(base + changes);

  const costOf = (k: CostKind) => sum(money.costs.filter((c) => c.kind === k).map((c) => c.amount));
  const cost = { labor: costOf('labor'), materials: costOf('materials'), subs: costOf('subs'), equipment: costOf('equipment'), total: 0 };
  cost.total = sum(KIND_ORDER.map((k) => cost[k]));

  const budget: Record<CostKind, number> = { labor: r2(est?.laborTotal ?? 0), materials: r2(est?.materialTotal ?? 0), subs: 0, equipment: 0 };
  const over = KIND_ORDER
    .filter((k) => budget[k] > 0 && cost[k] > budget[k] * 1.05)
    .map((k) => ({ kind: k, pct: Math.round(((cost[k] - budget[k]) / budget[k]) * 100), amount: r2(cost[k] - budget[k]) }));

  const profitAmount = r2(price - cost.total);

  const deposited = ct?.paid ?? 0;
  const spendable = r2(deposited - cost.total);
  const leftToSpend = Math.max(0, (est?.cost ?? 0) - cost.total);
  const status: FundsStatus = deposited === 0 && cost.total === 0 ? 'none'
    : spendable < 0 ? 'request'
    : leftToSpend > 0 && spendable < leftToSpend * 0.15 ? 'low' : 'ok';

  // What the owner owes: invoices (with tax) plus costs paid on the owner's behalf.
  const reimb = money.costs.filter((c) => c.ownerOwes);
  const reimbPaid = sum(reimb.filter((c) => c.ownerOwes?.paidOn).map((c) => c.amount));
  const reimbOpen = reimb.filter((c) => !c.ownerOwes?.paidOn);
  const owes = r2((ct?.invoiced ?? 0) + sum(reimb.map((c) => c.amount)));
  const received = r2((ct?.paid ?? 0) + reimbPaid);
  const balance = r2((ct?.due ?? 0) + sum(reimbOpen.map((c) => c.amount)));
  let overdueCount = 0;
  let overdueAmount = 0;
  if (contract) {
    const states = invoiceStates(contract, today, est?.salesTaxPct ?? 0);
    for (const v of contract.invoices) {
      const s = states[v.id];
      if (s && s.state !== 'paid' && v.dueDate < today) { overdueCount++; overdueAmount += v.amount + v.tax - s.paid; }
    }
  }
  for (const c of reimbOpen) if (c.ownerOwes && c.ownerOwes.due < today) { overdueCount++; overdueAmount += c.amount; }

  const salesPct = money.salesTaxPct ?? est?.salesTaxPct ?? 0;
  const sales = r2((price * salesPct) / 100);
  const income = r2((Math.max(0, profitAmount) * money.incomeTaxPct) / 100);
  const netAfterTax = r2(profitAmount - income);

  return {
    contract: { base: r2(base), changes: r2(changes), price },
    cost, budget, over,
    profit: { amount: profitAmount, marginPct: pct(profitAmount, price) },
    funds: { deposited: r2(deposited), spent: cost.total, spendable, status },
    owner: { owes, received, balance, overdueCount, overdueAmount: r2(overdueAmount) },
    tax: { salesPct, sales, incomePct: money.incomeTaxPct, income, reserve: r2(sales + income), netAfterTax, netMarginPct: pct(netAfterTax, price) },
  };
}

// ---------- Buy list ----------

/** The materials to buy, from the estimate's material list. The contractor can add, change or remove items. */
export function buyListFromEstimate(est: Estimate, newId: () => string): BuyItem[] {
  return est.materials.filter((m) => m.qty > 0).map((m) => ({
    id: newId(), name: m.name, qty: m.qty, unit: m.unit, estCost: r2(m.total), bought: false, source: 'estimate' as const,
  }));
}

export function buyTotals(items: BuyItem[]) {
  const planned = sum(items.map((i) => i.estCost));
  const bought = items.filter((i) => i.bought);
  return { planned, boughtCount: bought.length, count: items.length, spent: sum(items.map((i) => i.spent ?? 0)), left: sum(items.filter((i) => !i.bought).map((i) => i.estCost)) };
}

// ---------- Receipts ----------

export interface ReceiptRead { vendor: string; date: string; tax: number; total: number; kind: CostKind; lines: ReceiptLine[] }

export function receiptPrompt(buyNames: string[]): string {
  return `Read this purchase receipt for a construction job. Reply with JSON only, no other text:
{"vendor": string, "date": "YYYY-MM-DD" or "", "tax": number, "total": number, "kind": "materials" | "equipment" | "subs" | "labor",
 "lines": [{"name": string, "qty": number, "unit": string, "total": number}]}
Rules: "total" is the amount paid including tax. Each line's "total" is that line's price before tax. Use the short plain item name (no SKU codes).
"kind" is "equipment" for tool or machine rentals, otherwise "materials". If something can't be read, leave it out; never guess numbers.
${buyNames.length ? `Items the contractor planned to buy (use these names when a line clearly matches one):\n${buyNames.slice(0, 80).map((n) => `- ${n}`).join('\n')}` : ''}`;
}

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const numOr = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/[$,]/g, ''))) ? Number(v.replace(/[$,]/g, '')) : d);

/** Takes the AI's reply and keeps only sane values. Throws a message the contractor can act on. */
export function parseReceipt(reply: string): ReceiptRead {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('Bidwell could not read this receipt. Try a sharper photo, or type the amount.');
  }
  const kinds: CostKind[] = ['labor', 'materials', 'subs', 'equipment'];
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 100).flatMap((l): ReceiptLine[] => {
    if (!l || typeof l !== 'object') return [];
    const o = l as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const total = r2(numOr(o.total, NaN));
    if (!name || !Number.isFinite(total) || Math.abs(total) > 1e6) return [];
    const qty = numOr(o.qty, 1);
    return [{ name, qty: qty > 0 && qty < 1e6 ? qty : 1, unit: typeof o.unit === 'string' ? o.unit.trim().slice(0, 12) : '', total }];
  });
  const tax = r2(Math.max(0, numOr(raw.tax)));
  let total = r2(numOr(raw.total, NaN));
  if (!Number.isFinite(total) || total <= 0) total = r2(sum(lines.map((l) => l.total)) + tax);
  if (!(total > 0) || total > 1e6) throw new Error('Bidwell could not find the total on this receipt. Type the amount instead.');
  return {
    vendor: typeof raw.vendor === 'string' ? raw.vendor.trim().slice(0, 60) : '',
    date: isYmd(raw.date) ? raw.date : '',
    tax, total, lines,
    kind: kinds.includes(raw.kind as CostKind) ? (raw.kind as CostKind) : 'materials',
  };
}

const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'in', 'ft', 'pc', 'pcs', 'ea', 'each', 'sq', 'x', 'in.', 'lb', 'gal']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** How alike two item names are, 0..1 (shared words over the shorter name's words). */
export function nameMatch(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w) || [...wb].some((x) => (x.length > 3 && w.startsWith(x)) || (w.length > 3 && x.startsWith(w)))) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/** Links each receipt line to the buy list item it most likely paid for (only clear matches). */
export function matchReceipt(lines: ReceiptLine[], buy: BuyItem[]): ReceiptLine[] {
  return lines.map((l) => {
    let best: { id: string; score: number } | null = null;
    for (const b of buy) {
      const score = nameMatch(l.name, b.name);
      if (score >= 0.6 && (!best || score > best.score)) best = { id: b.id, score };
    }
    return best ? { ...l, buyId: best.id } : { ...l, buyId: undefined };
  });
}

/** Marks matched buy items as bought and adds what was paid for them. */
export function applyReceiptToBuy(buy: BuyItem[], lines: ReceiptLine[]): BuyItem[] {
  return buy.map((b) => {
    const paid = sum(lines.filter((l) => l.buyId === b.id).map((l) => l.total));
    return paid > 0 ? { ...b, bought: true, spent: r2((b.spent ?? 0) + paid) } : b;
  });
}

// ---------- Price lessons (learned from this contractor's own receipts, never shared) ----------

export interface PriceLesson {
  id: string;
  at: string; // YYYY-MM-DD of the receipt
  item: string;
  unit: string;
  /** Price per unit in the estimate. */
  quoted: number;
  /** Price per unit on the receipt. */
  paid: number;
  vendor: string;
  projectId: string;
}

/** One lesson per receipt line that matched a buy item whose quantities can be compared. */
export function lessonsFromReceipt(lines: ReceiptLine[], buy: BuyItem[], meta: { at: string; vendor: string; projectId: string }, newId: () => string): PriceLesson[] {
  const out: PriceLesson[] = [];
  for (const l of lines) {
    const b = buy.find((x) => x.id === l.buyId);
    if (!b || !(b.qty > 0) || !(l.qty > 0) || !(b.estCost > 0) || !(l.total > 0)) continue;
    const sameUnit = !l.unit || !b.unit || l.unit.toLowerCase().replace(/s$/, '') === b.unit.toLowerCase().replace(/s$/, '');
    if (!sameUnit) continue;
    out.push({ id: newId(), at: meta.at, item: b.name, unit: b.unit, quoted: r2(b.estCost / b.qty), paid: r2(l.total / l.qty), vendor: meta.vendor, projectId: meta.projectId });
  }
  return out;
}

export interface Drift { item: string; unit: string; quoted: number; paid: number; changePct: number; receipts: number }

/** Items whose recent receipt prices moved away from what the estimate used (newest 3 receipts per item). */
export function priceDrift(lessons: PriceLesson[], minPct = 5): Drift[] {
  const byItem = new Map<string, PriceLesson[]>();
  for (const l of lessons) byItem.set(l.item.toLowerCase(), [...(byItem.get(l.item.toLowerCase()) ?? []), l]);
  const out: Drift[] = [];
  for (const ls of byItem.values()) {
    const recent = [...ls].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
    const paid = r2(recent.reduce((t, l) => t + l.paid, 0) / recent.length);
    const quoted = recent[0].quoted;
    const changePct = Math.round(((paid - quoted) / quoted) * 100);
    if (Math.abs(changePct) >= minPct) out.push({ item: recent[0].item, unit: recent[0].unit, quoted, paid, changePct, receipts: recent.length });
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

/** A short note for the AI so new estimates use what this contractor really pays. */
export function lessonsContext(lessons: PriceLesson[]): string {
  const d = priceDrift(lessons).slice(0, 12);
  if (!d.length) return '';
  return `What this contractor actually paid on recent receipts (use these material prices when they apply): ${d
    .map((x) => `${x.item} $${x.paid}/${x.unit || 'unit'} (estimates used $${x.quoted}, ${x.changePct > 0 ? '+' : ''}${x.changePct}%)`).join('; ')}.`;
}
