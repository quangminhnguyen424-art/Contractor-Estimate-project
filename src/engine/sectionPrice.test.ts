import { describe, expect, it } from 'vitest';

import { applyMarkup, buildEstimate, type EstimateInput } from './estimator';
import { defaultAnswers } from './jobTypes';
import { baseSections } from './quote';
import { reapplySectionPrices, sectionPrices, setSectionPrices } from './sectionPrice';
import type { Estimate } from './types';

const input = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  jobTypeId: 'bathroom', mode: 'detailed', finish: 'mid', answers: defaultAnswers('bathroom'), customItems: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [],
  ...over,
});
const make = (over: Partial<EstimateInput> = {}) => {
  const i = input(over);
  return { ...buildEstimate(i), mode: i.mode, salesTaxPct: i.salesTaxPct, markupPct: i.markupPct } as unknown as Estimate;
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((t, x) => t + x, 0);

describe('a section price set by hand on the quote', () => {
  it('becomes the job’s price: subtotal, tax and total all follow', () => {
    const est = make();
    const [first] = est.trades;
    const out = setSectionPrices(est, { [first.trade]: first.price + 500 });
    expect(out.price).toBe(est.price + 500);
    expect(out.tax).toBe(Math.round(out.price * 10) / 100);
    expect(out.total).toBe(Math.round((out.price + out.tax) * 100) / 100);
    expect(out.markup).toBe(Math.round((out.price - out.cost) * 100) / 100);
    expect(sum(sectionPrices(out))).toBeCloseTo(out.price, 2);
    // The quote shows the same numbers.
    expect(baseSections(out, 'en').find((s) => s.trade === first.trade)?.price).toBe(first.price + 500);
  });

  it('can be undone, and setting it back to Bidwell’s price leaves nothing behind', () => {
    const est = make();
    const k = est.trades[0].trade;
    const set = setSectionPrices(est, { [k]: 1 });
    expect(setSectionPrices(set, { [k]: null })).toMatchObject({ price: est.price, total: est.total, priceEdits: undefined });
    expect(setSectionPrices(set, { [k]: est.trades[0].price }).priceEdits).toBeUndefined();
  });

  it('flags a section priced below its cost', () => {
    const est = make();
    const k = est.trades[0].trade;
    expect(setSectionPrices(est, { [k]: 1 }).checks.some((c) => c.id === 'below-cost')).toBe(true);
    expect(setSectionPrices(setSectionPrices(est, { [k]: 1 }), { [k]: null }).checks.some((c) => c.id === 'below-cost')).toBe(false);
  });

  it('stays set when the markup changes; the other sections follow the markup', () => {
    const est = make();
    const [a, b] = est.trades;
    const set = setSectionPrices(est, { [a.trade]: 9999 });
    const up = applyMarkup(set, 40, 15);
    expect(up.trades.find((t) => t.trade === a.trade)?.price).toBe(9999);
    expect(up.trades.find((t) => t.trade === b.trade)?.price).toBe(Math.round(b.cost * 1.4));
    expect(up.priceEdits?.[a.trade]).toEqual({ price: 9999, base: Math.round(a.cost * 1.4) });
    expect(up.price).toBeCloseTo(sum(sectionPrices(up)), 2);
  });

  it('works on a quick price and on the contractor’s own items', () => {
    const plain = make({ jobTypeId: 'painting', mode: 'quick', answers: defaultAnswers('painting') });
    // One of the contractor's own priced items on top of the quick price.
    const quick = { ...plain, extras: [{ id: 'x', label: 'Haul away', qty: 1, unit: '', price: 300 }], price: plain.price + 300 } as unknown as Estimate;
    const before = sectionPrices(quick);
    expect(before.extras).toBe(300);
    const out = setSectionPrices(quick, { general: 2000, extras: 250 });
    expect(out.price).toBe(2250);
    expect(sectionPrices(out)).toEqual({ general: 2000, extras: 250 });
    expect(baseSections(out, 'en').map((s) => s.price)).toEqual([2000, 250]);
    expect(setSectionPrices(out, { general: null, extras: null }).price).toBe(quick.price);
    expect(out.price - 2250).toBe(0);
  });

  it('is laid back on after the job is re-priced, for sections that still exist', () => {
    const est = make();
    const k = est.trades[0].trade;
    const set = setSectionPrices(est, { [k]: 5000, nope: 10 });
    expect(Object.keys(set.priceEdits ?? {})).toEqual([k]);
    const again = reapplySectionPrices(make(), set.priceEdits);
    expect(again.trades[0].price).toBe(5000);
    expect(again.total).toBe(set.total);
  });
});

describe('new construction, part by part', () => {
  const dadu = () => {
    const i = input({ jobTypeId: 'adu', mode: 'quick', answers: { ...defaultAnswers('adu'), sizeSf: 850 }, presets: { adu: { basic: 300, mid: 325, high: 425 } } as never });
    return { ...buildEstimate(i), jobTypeId: 'adu', mode: 'quick', salesTaxPct: 10, markupPct: 20 } as unknown as Estimate;
  };

  it('shows sixteen parts that add up to the per-SF price, like the 1206 N 157th St quote', () => {
    const est = dadu();
    expect(est.price).toBe(850 * 325);
    const parts = baseSections(est, 'en');
    expect(parts).toHaveLength(16);
    expect(parts.map((p) => p.title)).toContain('Foundation');
    expect(parts.reduce((t, p) => t + p.price, 0)).toBeCloseTo(est.price, 2);
    // Framing is the biggest part, about 14% of the price.
    const framing = parts.find((p) => p.trade === 'd-framing')!;
    expect(framing.price / est.price).toBeGreaterThan(0.13);
    expect(framing.price / est.price).toBeLessThan(0.15);
    expect(baseSections(est, 'vi').find((p) => p.trade === 'd-foundation')?.title).toBe('Móng');
  });

  it('lets one part be priced by hand; the rest keep their amounts and the total follows', () => {
    const est = dadu();
    const before = sectionPrices(est);
    const out = setSectionPrices(est, { 'd-site': before['d-site'] + 4000 });
    const after = sectionPrices(out);
    expect(out.price).toBe(est.price + 4000);
    expect(after['d-site']).toBe(before['d-site'] + 4000);
    expect(after['d-framing']).toBe(before['d-framing']);
    expect(Object.values(after).reduce((t, x) => t + x, 0)).toBeCloseTo(out.price, 2);
    expect(setSectionPrices(out, { 'd-site': null }).price).toBe(est.price);
  });
});
