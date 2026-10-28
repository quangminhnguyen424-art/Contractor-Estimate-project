import { describe, expect, it } from 'vitest';
import { demoAI } from './ai';
import { ASSEMBLIES, MATERIAL_BY_ID } from './catalog';
import { buildEstimate, comparePrice, historyPerSf, type EstimateInput } from './estimator';
import { defaultAnswers, JOB_TYPES } from './jobTypes';
import type { PastJob } from './types';

const base = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  jobTypeId: 'basement', mode: 'detailed', finish: 'mid', answers: defaultAnswers('basement'), customItems: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [],
  ...over,
});

describe('catalog integrity', () => {
  it('every assembly material exists', () => {
    for (const a of ASSEMBLIES) for (const m of a.materials) expect(MATERIAL_BY_ID[m.materialId], `${a.id} -> ${m.materialId}`).toBeTruthy();
  });
  it('every job type scope uses known assemblies and builds with defaults', () => {
    for (const jt of JOB_TYPES) {
      const est = buildEstimate(base({ jobTypeId: jt.id, answers: defaultAnswers(jt.id), mode: jt.detailed ? 'detailed' : 'quick' }));
      if (jt.id !== 'small') expect(est.price, jt.id).toBeGreaterThan(0);
      expect(Number.isFinite(est.total)).toBe(true);
    }
  });
});

describe('golden job: basement ADU conversion to 4 bedrooms', () => {
  // The real job from Oct 27, 2026: 45 LF walls, 5 doors + bifold, 2 showers, 1 toilet, 1 vanity,
  // kitchen, washer, ice maker, 50A range + 30A dryer ~75 ft, 20 lights, 5 switches, 10 outlets, 100 SF tile.
  const est = buildEstimate(base({ answers: { ...defaultAnswers('basement'), foundation: 'basement' } }));
  const mat = (id: string) => est.materials.find((m) => m.materialId === id);

  it('uses 6/3 wire for the 50A range and 10/3 for the dryer', () => {
    expect(mat('wire_63')?.qty).toBe(75);
    expect(mat('wire_103')?.qty).toBe(75);
  });
  it('takes off framing and drywall at realistic quantities', () => {
    expect(mat('stud_2x4x8')?.qty).toBeGreaterThanOrEqual(50);
    expect(mat('stud_2x4x8')?.qty).toBeLessThanOrEqual(70);
    expect(mat('drywall_sheet')?.qty).toBeGreaterThanOrEqual(24);
    expect(mat('drywall_sheet')?.qty).toBeLessThanOrEqual(32);
  });
  it('adds code items a GC would catch', () => {
    expect(mat('bath_fan')?.qty).toBe(2);
    expect(mat('smoke_co')?.qty).toBe(5);
    const ids = est.checks.map((c) => c.id);
    expect(ids).toContain('egress');
    expect(ids).toContain('panel');
    expect(ids).toContain('trench');
  });
  it('totals add up and markup is applied', () => {
    const tradeCost = est.trades.reduce((t, x) => t + x.cost, 0);
    expect(Math.abs(tradeCost - est.cost)).toBeLessThan(1);
    expect(Math.abs(est.price - est.cost * 1.2)).toBeLessThan(1);
    expect(Math.abs(est.total - est.price * 1.104)).toBeLessThan(1);
    // Materials in the same range as the hand takeoff (~$7.2k before fixtures/cabinets supplied)
    expect(est.materialTotal).toBeGreaterThan(5000);
  });
  it('owner-supplied fixtures and cabinets remove those materials', () => {
    const owner = buildEstimate(base({ answers: { ...defaultAnswers('basement'), fixturesBy: 'owner', cabinetsBy: 'owner' } }));
    expect(owner.materials.find((m) => m.materialId === 'shower_stall')).toBeUndefined();
    expect(owner.materials.find((m) => m.materialId === 'cabinet_lf')).toBeUndefined();
    expect(owner.price).toBeLessThan(est.price);
  });
});

describe('quick mode and price checks', () => {
  it('prices size x preset', () => {
    const est = buildEstimate(base({ jobTypeId: 'adu', mode: 'quick', answers: { sizeSf: 850 }, presets: { adu: { basic: 300, mid: 325, high: 400 } } }));
    expect(est.price).toBe(276250);
    expect(est.lines).toHaveLength(0);
  });
  it('learns $/SF from past jobs and flags outliers', () => {
    const jobs: PastJob[] = [
      { id: '1', jobTypeId: 'bathroom', title: 'A', sizeSf: 40, finish: 'mid', price: 20000, date: '2025-01-01' },
      { id: '2', jobTypeId: 'bathroom', title: 'B', sizeSf: 50, finish: 'mid', price: 25000, date: '2025-02-01' },
    ];
    expect(historyPerSf('bathroom', 'mid', jobs)).toMatchObject({ perSf: 500, count: 2 });
    expect(comparePrice('bathroom', 'mid', 40, 30000, {}, jobs).flag).toBe('high');
    expect(comparePrice('bathroom', 'mid', 40, 20500, {}, jobs).flag).toBe('ok');
    expect(comparePrice('bathroom', 'mid', 40, 10000, {}, jobs).flag).toBe('low');
  });
  it('warns when markup is below the minimum', () => {
    const est = buildEstimate(base({ markupPct: 10 }));
    expect(est.checks[0].id).toBe('margin');
  });
});

describe('demo AI', () => {
  it('reads the real job description', async () => {
    const r = await demoAI.parseScope(
      'Basement ADU, 3 rooms to 4 bedrooms. 45 ft of new walls, 5 doors and a bifold. Two new showers 3x3, 1 toilet, 1 vanity, washer, ice maker for fridge, range and dryer. Panel is 75 feet away. 20 lights, 5 switches, 10 outlets, 100 sf of tile.',
    );
    expect(r.jobTypeId).toBe('basement');
    expect(r.answers).toMatchObject({
      newWallLf: 45, doors: 5, bifolds: 1, showers: 2, toilets: 1, vanities: 1, bedrooms: 4, newBedrooms: 1,
      lights: 20, switches: 5, outlets: 10, tileSf: 100, panelDistanceFt: 75, foundation: 'basement',
      washer: true, iceMaker: true, range50a: true, dryer30a: true,
    });
    expect(r.answers.sizeSf).toBeUndefined(); // "100 sf of tile" is the tile area, not the project size
  });
  it('still reads a project size when one is given', async () => {
    const r = await demoAI.parseScope('Kitchen remodel about 160 sq ft, 30 sf of tile backsplash', 'kitchen');
    expect(r.answers.sizeSf).toBe(160);
  });
  it('extracts a past job from pasted quote text', async () => {
    const r = await demoAI.extractPastJob('Master bathroom remodel - mid grade\n60 sq ft\nTile shower $12,000\nTotal: $28,500');
    expect(r).toMatchObject({ jobTypeId: 'bathroom', sizeSf: 60, price: 28500, finish: 'mid' });
  });
});
