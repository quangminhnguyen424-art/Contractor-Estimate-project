import { TRADE_NAMES } from './catalog';
import { hasDivisions, splitDivisions } from './divisions';
import type { Check, Estimate } from './types';

/**
 * The client price of each section on the quote, and the contractor's own prices for them.
 *
 * A quote is split into sections: one per trade on a detailed estimate (demo, tile, plumbing…), one "general"
 * section on a quick price, and "extras" for the contractor's own items. The contractor may set any section's
 * price by hand on the quote. That price becomes the estimate's real price: the subtotal, tax and total are
 * recomputed from it, so the quote, the contract, the invoices and the payment schedule all agree.
 */

type Priced = Pick<Estimate, 'jobTypeId' | 'mode' | 'lines' | 'trades' | 'extras' | 'price' | 'cost' | 'markup' | 'tax' | 'total' | 'salesTaxPct' | 'checks' | 'priceEdits'>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isQuick = (e: Priced) => e.mode === 'quick' || e.lines.length === 0;

/** Each section's client price as the estimate stands now (with any hand-set prices). */
export function sectionPrices(e: Priced): Record<string, number> {
  const extrasOwn = (e.extras ?? []).reduce((t, x) => t + x.price, 0);
  const extras = e.priceEdits?.extras?.price ?? extrasOwn;
  const out: Record<string, number> = {};
  if (isQuick(e)) {
    const general = round2(e.price - (e.extras?.length ? extras : 0));
    if (hasDivisions(e.jobTypeId)) {
      // New construction: the per-SF price split part by part. Studwise's split is of the price before any part was
      // set by hand; the parts set by hand then replace their share.
      const handSet = Object.entries(e.priceEdits ?? {}).filter(([k]) => k.startsWith('d-'));
      const base = splitDivisions(round2(general - handSet.reduce((t, [, v]) => t + v.price - v.base, 0)));
      for (const [k, v] of Object.entries(base)) out[k] = e.priceEdits?.[k]?.price ?? v;
    } else out.general = general;
  }
  else for (const t of e.trades) out[t.trade] = t.price;
  if (e.extras?.length) out.extras = extras;
  return out;
}

/**
 * The estimate with these sections priced by hand (`null` puts a section back to Studwise's price). Sections not
 * named keep their current price. Unknown keys are ignored: a section can disappear when the job is re-priced.
 */
export function setSectionPrices<T extends Priced>(e: T, wanted: Record<string, number | null>): T {
  // Start from Studwise's own prices, then lay the contractor's on top.
  const now = sectionPrices(e);
  const base: Record<string, number> = { ...now };
  for (const [k, v] of Object.entries(e.priceEdits ?? {})) if (k in base) base[k] = v.base;
  const edits: Record<string, { price: number; base: number }> = {};
  for (const [k, v] of Object.entries(e.priceEdits ?? {})) if (k in base) edits[k] = { price: v.price, base: base[k] };
  for (const [k, v] of Object.entries(wanted)) {
    if (!(k in base)) continue;
    if (v == null || !Number.isFinite(v) || Math.abs(v - base[k]) < 0.005) delete edits[k];
    else edits[k] = { price: round2(Math.max(0, v)), base: base[k] };
  }
  const price = (k: string) => edits[k]?.price ?? base[k];
  const trades = isQuick(e) ? e.trades : e.trades.map((t) => ({ ...t, price: price(t.trade) }));
  const total = round2(Object.keys(base).reduce((t, k) => t + price(k), 0));
  const tax = round2(total * e.salesTaxPct / 100);
  // A section priced below what it costs you is worth a second look before sending.
  const under = isQuick(e) ? [] : trades.filter((t) => edits[t.trade] && t.price < t.cost);
  const checks: Check[] = e.checks.filter((c) => c.id !== 'below-cost');
  if (under.length) {
    checks.unshift({ id: 'below-cost', level: 'warn', title: `Priced below your cost: ${under.map((t) => TRADE_NAMES[t.trade]?.en ?? t.trade).join(', ')}`,
      detail: 'A price you set on the quote is less than the labor and materials for that section.' });
  }
  const kept = Object.keys(edits).length ? edits : undefined;
  return { ...e, trades, price: total, markup: round2(total - e.cost), tax, total: round2(total + tax), checks, priceEdits: kept };
}

/** Puts the hand-set prices back on a freshly priced estimate (after the markup or the job details changed). */
export function reapplySectionPrices<T extends Priced>(fresh: T, edits: Estimate['priceEdits']): T {
  const { priceEdits: _drop, ...rest } = fresh;
  const clean = rest as T;
  if (!edits || !Object.keys(edits).length) return clean;
  return setSectionPrices(clean, Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, v.price])));
}
