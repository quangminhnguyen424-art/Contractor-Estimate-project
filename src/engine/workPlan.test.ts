import { describe, expect, it } from 'vitest';

import { buildEstimate, type EstimateInput } from './estimator';
import { baseSections } from './quote';
import type { Estimate, WorkSection } from './types';
import { cleanPlan, NeedSizeError, planUserText, priceBookList, sanitizeWork } from './workPlan';

const input = (work: WorkSection[], over: Partial<EstimateInput> = {}): EstimateInput => ({
  jobTypeId: 'flooring', mode: 'detailed', finish: 'mid', answers: { sizeSf: 400 }, customItems: [], work,
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [], ...over,
});

const flooring = {
  size: 400,
  sections: [
    { title: 'Demo & site cleanup', vi: 'Phá dỡ & dọn dẹp', items: [
      { name: 'Remove carpet and pad, haul away', vi: 'Gỡ thảm và lót, chở đi', qty: 400, unit: 'SF', hours: 6, materials: 120, from: 'notes' },
    ] },
    { title: 'Vapor barrier', items: [{ name: 'Install 6 mil vapor barrier', qty: 400, unit: 'SF', hours: 3, materials: 90, from: 'assumed' }] },
    { title: 'LVP install', items: [
      { task: 'lvp_floor', qty: 400, from: 'notes' },
      { task: 'floor_transition', qty: 3, from: 'photo' },
    ] },
  ],
  notes: ['Photo 1: carpet over slab'],
};

describe('cleanPlan', () => {
  it('keeps the job’s own sections in order, with price-book tasks and written items', () => {
    const p = cleanPlan(flooring);
    expect(p.work.map((s) => s.title)).toEqual(['Demo & site cleanup', 'Vapor barrier', 'LVP install']);
    expect(p.work.map((s) => s.key)).toEqual(['s1', 's2', 's3']);
    expect(p.work[0].vi).toBe('Phá dỡ & dọn dẹp');
    expect(p.work[1].vi).toBe('Vapor barrier'); // no Vietnamese given: the English stands in
    expect(p.work[2].items[0]).toMatchObject({ assemblyId: 'lvp_floor', name: 'LVP floor', unit: 'SF', qty: 400, from: 'notes' });
    expect(p.work[0].items[0]).toMatchObject({ hours: 6, materials: 120, unit: 'SF' });
    expect(p.size).toBe(400);
    expect(p.notes).toEqual(['Photo 1: carpet over slab']);
  });

  it('drops what cannot be priced and never trusts the numbers blindly', () => {
    const p = cleanPlan({ sections: [
      { title: 'Work', items: [
        { task: 'not_a_task', qty: 2 }, // unknown task
        { task: 'elec_light', qty: 50_000 }, // impossible count
        { task: 'elec_light', qty: 2 }, // the same task again: one line
        { name: 'Nothing to price', qty: 1, unit: 'EA', hours: 0, materials: 0 },
        { name: 'Odd unit', qty: 3, unit: 'furlong', hours: 2, materials: 0 },
        { name: 'Lump', qty: 7, unit: 'LS', hours: 1, materials: 0 },
        'junk',
      ] },
      { title: 'Empty', items: [] },
      { items: [{ task: 'elec_outlet', qty: 1 }] }, // no title
    ] });
    expect(p.work).toHaveLength(1);
    const items = p.work[0].items;
    expect(items.map((i) => i.name)).toEqual(['Add light (recessed LED)', 'Odd unit', 'Lump']);
    expect(items[0].qty).toBe(500);
    expect(items[1].unit).toBe('EA');
    expect(items[2].qty).toBe(1);
    expect(items.every((i) => i.from === 'assumed')).toBe(true);
  });

  it('asks for the size instead of inventing one', () => {
    expect(() => cleanPlan({ needSize: 'The floor area in square feet' })).toThrow(NeedSizeError);
    expect(cleanPlan({ needSize: 'x', sections: flooring.sections }).work).toHaveLength(3);
  });
});

describe('pricing a planned job', () => {
  const work = cleanPlan(flooring).work;

  it('prices price-book tasks from the price book and written items from hours and materials', () => {
    const r = buildEstimate(input(work, { priceBook: { labor: { lvp_floor: 2 }, materials: {}, hourly: 50 } }));
    const demo = r.lines.find((l) => l.name.startsWith('Remove carpet'))!;
    expect(demo.labor).toBe(300); // 6 hr × $50
    expect(demo.materials).toBe(120);
    expect(demo.hours).toBe(6);
    const lvp = r.lines.find((l) => l.assemblyId === 'lvp_floor')!;
    expect(lvp.labor).toBe(800); // the contractor's own $2/SF
    expect(lvp.materials).toBeGreaterThan(0);
    expect(r.trades.map((t) => t.title)).toEqual(['Demo & site cleanup', 'Vapor barrier', 'LVP install']);
    expect(r.trades[0]).toMatchObject({ trade: 's1', labor: 300, materials: 120, cost: 420, price: 504 });
    expect(r.price).toBe(r.trades.reduce((t, x) => t + x.price, 0));
    expect(r.laborTotal + r.materialTotal).toBeCloseTo(r.cost, 1);
    expect(r.materials.find((m) => m.materialId.startsWith('w:'))).toMatchObject({ category: 'Other materials', qty: 1, unit: 'lot' });
    expect(r.checks.map((c) => c.id)).toEqual(expect.arrayContaining(['own-items', 'judged']));
    expect(r.checks.some((c) => c.id === 'quick')).toBe(false);
  });

  it('uses the default hourly cost until the contractor sets one, and ignores items set to zero', () => {
    const zeroed = work.map((s) => ({ ...s, items: s.items.map((i) => (i.assemblyId === 'floor_transition' ? { ...i, qty: 0 } : i)) }));
    const r = buildEstimate(input(zeroed));
    expect(r.lines.find((l) => l.name.startsWith('Remove carpet'))!.labor).toBe(360); // 6 hr × $60
    expect(r.lines.some((l) => l.assemblyId === 'floor_transition')).toBe(false);
  });

  it('plans any type of work, including ones with only a quick price', () => {
    const r = buildEstimate(input(work, { jobTypeId: 'gutters' }));
    expect(r.lines.length).toBe(4);
    expect(r.trades).toHaveLength(3);
  });

  it('puts the job’s own sections on the quote, in the client’s language', () => {
    const r = buildEstimate(input(work));
    const est = { ...r, jobTypeId: 'flooring', mode: 'detailed', work, scopeNote: '' } as unknown as Estimate;
    expect(baseSections(est, 'en').map((s) => s.title)).toEqual(['Demo & site cleanup', 'Vapor barrier', 'LVP install']);
    const vi = baseSections(est, 'vi');
    expect(vi[0].title).toBe('Phá dỡ & dọn dẹp');
    expect(vi[0].items).toEqual(['Gỡ thảm và lót, chở đi (400 SF)']);
    expect(vi[2].items[0]).toBe('Sàn vinyl LVP (400 SF)');
  });
});

describe('what the AI is told', () => {
  it('lists the contractor’s own prices and the job', () => {
    const pb = { labor: { lvp_floor: 2 }, materials: {}, hourly: 55 };
    const list = priceBookList(pb, 'mid');
    expect(list).toMatch(/lvp_floor \| LVP floor \| SF \| \$\d/);
    expect(list).toContain('Tile & flooring:');
    const t = planUserText({ jobTypeId: 'flooring', text: 'LVP in the living room', size: 400, finish: 'mid', priceBook: pb, markupPct: 20, wantVi: false }, '');
    expect(t).toContain('Size: 400 SF');
    expect(t).toContain('$55 per hour');
    expect(t).toContain('LVP in the living room');
    expect(planUserText({ jobTypeId: 'flooring', text: '', finish: 'mid', priceBook: pb, markupPct: 20, wantVi: false }, '')).toContain('not typed in');
  });
});

describe('sanitizeWork', () => {
  it('keeps a saved list and drops broken rows', () => {
    const work = cleanPlan(flooring).work;
    expect(sanitizeWork(JSON.parse(JSON.stringify(work)))).toEqual(work);
    expect(sanitizeWork(undefined)).toBeUndefined();
    expect(sanitizeWork([{ key: 's1', title: 'A', items: [{ id: 'x', name: '', qty: 1 }, { id: 'y', name: 'Ok', qty: 2, unit: 'EA', hours: 1 }] }])![0].items).toHaveLength(1);
  });
});
