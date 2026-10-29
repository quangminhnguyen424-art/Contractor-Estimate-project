import { afterEach, describe, expect, it } from 'vitest';

import { wonToPastJobs } from '../store/learning';
import { EMPTY, sanitizePersisted } from '../store/sanitize';
import { cleanAnswers, cleanScopeResult, demoAI, guessJobType } from './ai';
import { applyMarkup, buildEstimate, type EstimateInput } from './estimator';
import { defaultAnswers, estimateJob, isJobTypeId, JOB_TYPES, jobType, setCustomJobs } from './jobTypes';
import { quoteHtml, quoteSections } from './quote';
import type { Estimate, Profile, Question } from './types';

const input = (over: Partial<EstimateInput>): EstimateInput => ({
  jobTypeId: 'bathroom', mode: 'quick', finish: 'mid', answers: {}, customItems: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [],
  ...over,
});

const profile: Profile = {
  companyName: 'Test Co', contactName: 'A', phone: '1', email: 'a@b.c', license: 'X', specialties: [], markupPct: 20,
  minMarkupPct: 15, salesTaxPct: 10, quoteValidDays: 30, quoteLanguage: 'en', about: '',
  schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Rest', pct: 90 }],
};

const asEstimate = (r: ReturnType<typeof buildEstimate>, over: Partial<Estimate>): Estimate => ({
  id: 'e1', createdAt: '2026-10-29', updatedAt: '2026-10-29', status: 'draft', mode: 'quick', jobTypeId: 'bathroom',
  title: 'T', clientName: '', address: '', description: '', scopeNote: '', photos: [], finish: 'mid', answers: {},
  customItems: [], markupPct: 20, salesTaxPct: 10, ...r, ...over,
});

const haul: Question = { id: 'cq_haul', label: 'Haul-away', kind: 'yesno', default: false, price: 350 };
const outlets: Question = { id: 'cq_out', label: 'Extra outlets', kind: 'number', unit: 'EA', default: 0, price: 185 };
const gate: Question = { id: 'cq_gate', label: 'Gate code', kind: 'text', default: '' };

afterEach(() => setCustomJobs([], {}));

describe('more types of work, priced per unit', () => {
  it('prices a fence per LF and a water heater per item', () => {
    const fence = buildEstimate(input({ jobTypeId: 'fence', answers: { sizeSf: 120 } }));
    expect(fence.price).toBe(120 * 60);
    expect(fence.comparison).toMatchObject({ unit: 'LF', pricePerSf: 60, flag: 'ok' });
    expect(fence.comparison.message).toContain('/LF');
    const wh = buildEstimate(input({ jobTypeId: 'waterheater', answers: { sizeSf: 2 }, finish: 'high' }));
    expect(wh.price).toBe(11000);
  });
  it('prices a per-job type at one price without a size question', () => {
    expect(jobType('panel').questions.some((q) => q.id === 'sizeSf')).toBe(false);
    expect(buildEstimate(input({ jobTypeId: 'panel', answers: {} })).price).toBe(4500);
  });
  it('guesses the new types from notes without stealing remodels', () => {
    expect(guessJobType('Tear off and re-roof 22 squares, architectural shingles')).toBe('roofing');
    expect(guessJobType('150 ft cedar fence with one gate')).toBe('fence');
    expect(guessJobType('Hall bathroom remodel, also replace the window')).toBe('bathroom');
    expect(guessJobType('Paint the exterior of the house')).toBe('extpaint');
  });
  it('reads LF and item counts for those types offline', async () => {
    expect((await demoAI.parseScope('150 ft cedar fence', 'fence')).answers.sizeSf).toBe(150);
    expect((await demoAI.parseScope('replace 8 vinyl windows', 'windows')).answers.sizeSf).toBe(8);
  });
});

describe("the contractor's own types and questions", () => {
  it('registers an own type of work, with their own price', () => {
    setCustomJobs([{ id: 'ct_mold', name: 'Mold remediation', unit: 'SF' }], {});
    expect(isJobTypeId('ct_mold')).toBe(true);
    expect(JOB_TYPES[0].id).toBe('ct_mold'); // own types listed first
    expect(guessJobType('Mold remediation in the crawlspace, about 300 sf')).toBe('ct_mold');
    const est = buildEstimate(input({ jobTypeId: 'ct_mold', answers: { sizeSf: 300 }, presets: { ct_mold: { basic: 8, mid: 10, high: 14 } } }));
    expect(est.price).toBe(3000);
  });
  it('a deleted own type never breaks an old estimate', () => {
    expect(jobType('ct_gone').name).toBe('Other work');
    expect(() => buildEstimate(input({ jobTypeId: 'ct_gone' }))).not.toThrow();
  });
  it('adds priced questions as their own quote lines, in quick and detailed estimates', () => {
    setCustomJobs([], { bathroom: [haul, outlets, gate] });
    const answers = { ...defaultAnswers('bathroom'), cq_haul: true, cq_out: 3, cq_gate: '#1234' };
    const quick = buildEstimate(input({ answers }));
    expect(quick.extras.map((x) => x.price)).toEqual([350, 555]);
    expect(quick.price).toBe(Math.round(45 * 300) + 905);
    expect(quick.comparison.pricePerSf).toBe(300); // the price check ignores the extras

    const detailed = buildEstimate(input({ mode: 'detailed', answers }));
    const trades = detailed.trades.reduce((t, x) => t + x.price, 0);
    expect(detailed.price).toBe(trades + 905);
    const est = asEstimate(detailed, { mode: 'detailed', answers });
    const sections = quoteSections(est, 'en');
    expect(sections.at(-1)).toMatchObject({ title: 'Additional items', price: 905, items: ['Haul-away', 'Extra outlets (3 EA)'] });
    expect(sections.reduce((t, s) => t + s.price, 0)).toBe(est.price);
    // Markup changes keep the extras at the contractor's price.
    const higher = applyMarkup(est, 30, 15);
    expect(higher.price).toBe(higher.trades.reduce((t, x) => t + x.price, 0) + 905);
    expect(quoteHtml(est, profile, 'en')).not.toContain('#1234'); // text answers stay private
  });
  it('lets Claude fill text answers to own questions, trimmed', () => {
    setCustomJobs([], { bathroom: [gate] });
    expect(cleanAnswers('bathroom', { cq_gate: '  code 1234 ', cq_unknown: 'x' })).toEqual({ cq_gate: 'code 1234' });
  });
});

describe('saving and restoring', () => {
  it('keeps own types and questions, and drops broken ones', () => {
    const r = sanitizePersisted({
      ...EMPTY,
      profile: { companyName: 'x', specialties: ['ct_a', 'ct_bad', 'roofing'], about: 'I sub out electrical.' },
      customTypes: [{ id: 'ct_a', name: 'Pressure washing', unit: 'SF' }, { id: 'ct_b', name: '' }, { id: 'nope', name: 'X' }],
      customQuestions: {
        ct_a: [{ id: 'cq_1', label: 'Moss treatment?', kind: 'yesno', price: 200 }, { id: 'cq_2', label: '' }],
        roofing: [{ id: 'cq_3', label: 'Layers to tear off', kind: 'number', unit: 'layers', price: -5 }],
        ghost: [{ id: 'cq_4', label: 'x', kind: 'text' }],
      },
    });
    expect(r.data.customTypes).toEqual([{ id: 'ct_a', name: 'Pressure washing', unit: 'SF' }]);
    expect(r.data.profile?.specialties).toEqual(['ct_a', 'roofing', 'small']);
    expect(r.data.profile?.about).toBe('I sub out electrical.');
    expect(Object.keys(r.data.customQuestions)).toEqual(['ct_a', 'roofing']);
    expect(r.data.customQuestions.ct_a).toHaveLength(1);
    expect(r.data.customQuestions.roofing[0].price).toBeUndefined(); // negative prices are ignored
    expect(jobType('roofing').questions.some((q) => q.id === 'cq_3')).toBe(true);
  });
});

describe('learning from won jobs', () => {
  it('saves a won estimate as a past job (without extras) and removes it when un-won', () => {
    setCustomJobs([], { bathroom: [haul] });
    const r = buildEstimate(input({ answers: { sizeSf: 40, cq_haul: true } }));
    const est = asEstimate(r, { answers: { sizeSf: 40, cq_haul: true } });
    const d = { ...EMPTY, estimates: [est] };
    const won = wonToPastJobs(d, 'e1', 'won');
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ id: 'won_e1', jobTypeId: 'bathroom', sizeSf: 40, price: 12000, finish: 'mid' });
    expect(wonToPastJobs({ ...d, pastJobs: won }, 'e1', 'lost')).toEqual([]);
  });
});

describe('review fixes', () => {
  it('a sent quote keeps its own type name, unit and exclusions after the type is deleted', () => {
    setCustomJobs([{ id: 'ct_mold', name: 'Mold remediation', unit: 'SF' }], {});
    const r = buildEstimate(input({ jobTypeId: 'ct_mold', answers: { sizeSf: 500 }, presets: { ct_mold: { basic: 12, mid: 12, high: 12 } } }));
    const est = asEstimate(r, { jobTypeId: 'ct_mold', job: { name: 'Mold remediation', vi: 'Mold remediation', unit: 'SF', exclusions: ['Testing'], exclusionsVi: [] } });
    setCustomJobs([], {});
    expect(estimateJob(est)).toMatchObject({ name: 'Mold remediation', unit: 'SF', deleted: true });
    const html = quoteHtml(est, profile, 'en');
    expect(html).toContain('Mold remediation (500 SF)');
    expect(html).toContain('Testing');
    expect(html).toContain('$6,000');
  });
  it('one-word own types never take over a remodel; multi-word ones win', () => {
    setCustomJobs([{ id: 'ct_tile', name: 'Tile', unit: 'SF' }, { id: 'ct_pw', name: 'Pressure washing', unit: 'SF' }], {});
    expect(guessJobType('Bathroom remodel with a tile shower')).toBe('bathroom');
    expect(guessJobType('Tile 200 sf entry')).toBe('ct_tile');
    expect(guessJobType('Pressure washing the deck and fence')).toBe('ct_pw');
    expect(guessJobType('retile the stile')).toBeUndefined(); // whole words only
  });
  it('caps priced own answers and flags them for a check', () => {
    const dump: Question = { id: 'cq_dump', label: 'Dump runs', kind: 'number', default: 0, price: 400 };
    const area: Question = { id: 'cq_area', label: 'Extra area', kind: 'number', unit: 'sq ft', default: 0, price: 2 };
    setCustomJobs([], { bathroom: [dump, area] });
    expect(cleanAnswers('bathroom', { cq_dump: 200, cq_area: 600 })).toEqual({ cq_area: 600 });
    const r = cleanScopeResult({ answers: { cq_dump: 2 } }, 'bathroom');
    expect(r.heard[0]).toBe('Check: Dump runs = 2 (adds to the price)');
  });
  it('small jobs get no dead-end price check', () => {
    const r = buildEstimate(input({ jobTypeId: 'small', mode: 'detailed', customItems: [{ assemblyId: 'elec_outlet', qty: 2 }] }));
    expect(r.comparison.message).toMatch(/item by item/);
  });
  it('does not learn from a won job priced in a unit the type no longer uses', () => {
    setCustomJobs([{ id: 'ct_x', name: 'Thing work', unit: 'JOB' }], {});
    const r = buildEstimate(input({ jobTypeId: 'ct_x', answers: {}, presets: { ct_x: { basic: 500, mid: 500, high: 500 } } }));
    const est = asEstimate(r, { jobTypeId: 'ct_x', comparison: { ...r.comparison, unit: 'SF', sizeSf: 100 } });
    expect(wonToPastJobs({ ...EMPTY, estimates: [est] }, 'e1', 'won')).toEqual([]);
  });
});
