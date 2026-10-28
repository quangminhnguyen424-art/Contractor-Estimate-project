// Regression tests for issues found in the independent QA review (Oct 28, 2026).
import { describe, expect, it } from 'vitest';
import { demoAI, guessJobType } from './ai';
import { applyMarkup, buildEstimate, type EstimateInput } from './estimator';
import { defaultAnswers, JOB_TYPES } from './jobTypes';
import { quoteHtml, quoteSections, scheduleAmounts } from './quote';
import type { Estimate, FinishLevel, Profile } from './types';

const profile: Profile = {
  companyName: 'Test Co', contactName: 'A', phone: '1', email: 'a@b.c', license: 'X', specialties: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4, quoteValidDays: 30, quoteLanguage: 'en',
  schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Rough', pct: 40 }, { label: 'Finish', pct: 40 }, { label: 'Final', pct: 10 }],
};
const input = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  jobTypeId: 'bathroom', mode: 'detailed', finish: 'mid', answers: defaultAnswers('bathroom'), customItems: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [], ...over,
});
const asEstimate = (r: ReturnType<typeof buildEstimate>, over: Partial<Estimate> = {}): Estimate => ({
  id: 'abc123', createdAt: '2026-10-28T12:00:00Z', updatedAt: '2026-10-28T12:00:00Z', status: 'draft', mode: 'detailed',
  jobTypeId: 'bathroom', title: 'T', clientName: 'C', address: '', description: 'Client is cheap, bump 15%', scopeNote: '',
  photos: [], finish: 'mid', answers: {}, customItems: [], markupPct: 20, salesTaxPct: 10.4, ...r, ...over,
});

describe('money adds up on client documents', () => {
  it('sections, subtotal, tax, total and schedule are consistent for every job type, finish and markup', () => {
    for (const jt of JOB_TYPES) {
      if (jt.id === 'small') continue;
      for (const finish of ['basic', 'mid', 'high'] as FinishLevel[]) {
        for (const markupPct of [0, 12, 15, 20, 27.5, 35]) {
          const mode = jt.detailed ? 'detailed' : 'quick';
          const r = buildEstimate(input({ jobTypeId: jt.id, answers: defaultAnswers(jt.id), finish, markupPct, mode }));
          const est = asEstimate(r, { jobTypeId: jt.id, mode });
          expect(Number.isInteger(est.price)).toBe(true);
          const sections = quoteSections(est, 'en');
          expect(sections.reduce((t, s) => t + s.price, 0)).toBe(est.price);
          for (const s of sections) expect(Number.isInteger(s.price)).toBe(true);
          const sched = scheduleAmounts(est, profile);
          expect(sched.reduce((t, s) => t + s.amount, 0)).toBe(est.price);
          expect(Math.round(est.price) + Math.round(est.tax)).toBe(Math.round(est.total));
        }
      }
    }
  });
});

describe('small jobs', () => {
  it('are always itemized, even if Quick mode is requested', () => {
    const r = buildEstimate(input({ jobTypeId: 'small', mode: 'quick', answers: defaultAnswers('small'), customItems: [{ assemblyId: 'elec_outlet', qty: 3 }] }));
    expect(r.price).toBeGreaterThan(0);
    expect(r.lines).toHaveLength(1);
  });
  it('can bill a supplied fixture', () => {
    const r = buildEstimate(input({ jobTypeId: 'small', answers: {}, customItems: [{ assemblyId: 'install_toilet', qty: 1 }, { assemblyId: 'supply_toilet', qty: 1 }] }));
    expect(r.materials.find((m) => m.materialId === 'toilet')?.qty).toBe(1);
  });
});

describe('markup', () => {
  it('quick mode has no margin warning (price comes from $/SF)', () => {
    const r = buildEstimate(input({ jobTypeId: 'adu', mode: 'quick', answers: { sizeSf: 800 }, markupPct: 5 }));
    expect(r.checks.find((c) => c.id === 'margin')).toBeUndefined();
  });
  it('changing markup keeps saved costs and the quoted tax rate', () => {
    const r = buildEstimate(input());
    const est = asEstimate(r, { salesTaxPct: 9 });
    const next = applyMarkup(est, 30, 15);
    expect(next.cost).toBe(est.cost);
    expect(next.price).toBe(next.trades.reduce((t, x) => t + x.price, 0));
    expect(next.tax).toBeCloseTo(next.price * 0.09, 2);
    expect(applyMarkup(est, 10, 15).checks[0].id).toBe('margin');
  });
});

describe('confidentiality', () => {
  it('private job notes, cost and markup never reach the client PDF', () => {
    const r = buildEstimate(input());
    const est = asEstimate(r, { scopeNote: 'Remodel hall bath' });
    const html = quoteHtml(est, profile, 'en');
    expect(html).not.toContain('Client is cheap');
    expect(html).toContain('Remodel hall bath');
    expect(html).not.toMatch(/markup|labor cost|your cost/i);
  });
});

describe('construction logic', () => {
  it('tiled shower includes a pan, and tile on a wood subfloor gets a membrane', () => {
    const r = buildEstimate(input({ answers: { ...defaultAnswers('bathroom'), foundation: 'crawl' } }));
    const ids = r.lines.map((l) => l.assemblyId);
    expect(ids).toContain('shower_pan');
    expect(ids).toContain('tile_underlayment');
    expect(ids).toContain('elec_20a_circuit');
  });
  it('relocated toilet and vanity do not double-count stops and traps', () => {
    const r = buildEstimate(input({ answers: { ...defaultAnswers('bathroom'), relocate: true, toilets: 1, vanities: 1 } }));
    expect(r.materials.find((m) => m.materialId === 'angle_stop')?.qty).toBe(3);
    expect(r.materials.find((m) => m.materialId === 'trap_15')?.qty).toBe(1);
  });
  it('kitchen has small-appliance and dishwasher circuits; basement kitchenette has countertop and sink', () => {
    const k = buildEstimate(input({ jobTypeId: 'kitchen', answers: defaultAnswers('kitchen') }));
    expect(k.lines.find((l) => l.assemblyId === 'elec_20a_circuit')?.qty).toBe(3);
    const b = buildEstimate(input({ jobTypeId: 'basement', answers: defaultAnswers('basement') }));
    const ids = b.lines.map((l) => l.assemblyId);
    expect(ids).toEqual(expect.arrayContaining(['countertop', 'install_sink', 'supply_kitchen_sink']));
  });
});

describe('demo AI edge cases', () => {
  const parse = (t: string, j?: Parameters<typeof demoAI.parseScope>[1]) => demoAI.parseScope(t, j);
  it('handles thousands separators', async () => {
    expect((await parse('Paint about 1,200 sq ft', 'painting')).answers.sizeSf).toBe(1200);
  });
  it('separates removed walls from new walls', async () => {
    const r = await parse('Basement: remove 12 ft of wall, frame 30 ft of new walls', 'basement');
    expect(r.answers).toMatchObject({ demoWallLf: 12, newWallLf: 30 });
  });
  it('dishwasher is not a washer; gas range is not a 50A circuit', async () => {
    const r = await parse('Kitchen with dishwasher and gas range', 'kitchen');
    expect(r.answers.washer).toBeUndefined();
    expect(r.answers).toMatchObject({ dishwasher: true, range: 'gas' });
  });
  it('panel distance is not read as drain distance', async () => {
    const r = await parse('Main panel is 60 feet away', 'basement');
    expect(r.answers.drainDistanceFt).toBeUndefined();
    expect(r.answers.panelDistanceFt).toBe(60);
  });
  it('tub-to-shower conversion with separate wall and floor areas', async () => {
    const r = await parse('Remove tub, replace with tiled walk-in shower, 90 sf shower walls, 40 sf floor', 'bathroom');
    expect(r.answers).toMatchObject({ showerType: 'tile', showerWallSf: 90, floorTileSf: 40 });
    expect(r.answers.sizeSf).toBeUndefined();
  });
  it('owner-supplied cabinets are not fixtures', async () => {
    const r = await parse('Basement, owner supplies cabinets', 'basement');
    expect(r.answers.cabinetsBy).toBe('owner');
    expect(r.answers.fixturesBy).toBeUndefined();
  });
  it('job type guesses', () => {
    expect(guessJobType('Convert tub to walk-in shower')).toBe('bathroom');
    expect(guessJobType('Repaint master bedroom to match hallway')).toBe('painting');
  });
  it('"a" inside words is not a number', async () => {
    const r = await parse('Install pella doors and an area light', 'basement');
    expect(r.answers.doors).toBeUndefined();
  });
  it('past job: Customer is not "custom"; area is not price; pre-tax price preferred', async () => {
    const r = await demoAI.extractPastJob('Customer: Lee\nBathroom remodel\nTotal area 160 sq ft\nContract price $24,000\nSales tax $2,496\nTotal with tax $26,496');
    expect(r.finish).toBeUndefined();
    expect(r.sizeSf).toBe(160);
    expect(r.price).toBe(24000);
  });
});
