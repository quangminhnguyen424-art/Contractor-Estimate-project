import { describe, expect, it } from 'vitest';

import { buildEstimate } from './estimator';
import { laborToLearn, learnFromQuotes, learnFromWork, taughtContext } from './learned';
import type { Estimate, WorkItem, WorkSection } from './types';

const task = (id: string, assemblyId: string, qty: number, more: Partial<WorkItem> = {}): WorkItem => ({ id, assemblyId, name: assemblyId, vi: assemblyId, qty, unit: 'SF', ...more });
const own = (id: string, name: string, hours: number, materials: number, more: Partial<WorkItem> = {}): WorkItem => ({ id, name, vi: name, qty: 1, unit: 'LS', hours, materials, ...more });
const sec = (items: WorkItem[]): WorkSection[] => [{ key: 's1', title: 'Work', vi: 'Work', items }];
let n = 0;
const est = (jobTypeId: string, ai: WorkItem[], final: WorkItem[]): Estimate => ({
  id: `e${++n}`, jobTypeId, updatedAt: `2026-11-${String(10 + n).padStart(2, '0')}T00:00:00.000Z`, status: 'draft',
  work: sec(final), workAi: sec(ai), trades: [], priceEdits: undefined,
} as unknown as Estimate);

describe('learning from the contractor’s changes to work lists', () => {
  it('learns a labor cost set by hand on two jobs, as the middle of the last three', () => {
    const one = est('flooring', [task('i1', 'lvp_floor', 400)], [task('i1', 'lvp_floor', 400, { labor: 2.5, from: 'you' })]);
    expect(learnFromWork([one]).labor).toEqual([]); // once is not a habit
    const two = est('flooring', [task('i1', 'lvp_floor', 300)], [task('i1', 'lvp_floor', 300, { labor: 2.75, from: 'you' })]);
    const three = est('kitchen', [task('i1', 'lvp_floor', 150)], [task('i1', 'lvp_floor', 150, { labor: 2.6, from: 'you' })]);
    expect(learnFromWork([one, two]).labor).toEqual([{ assemblyId: 'lvp_floor', name: 'LVP floor', unit: 'SF', rate: 2.63, times: 2 }]);
    expect(learnFromWork([one, two, three]).labor[0]).toMatchObject({ rate: 2.6, times: 3 });
  });

  it('moves it into the price book only when they just set it again and it differs', () => {
    const pb = { labor: {}, materials: {} };
    const a = est('flooring', [task('i1', 'lvp_floor', 400)], [task('i1', 'lvp_floor', 400, { labor: 2.5 })]);
    const b = est('flooring', [task('i1', 'lvp_floor', 300)], [task('i1', 'lvp_floor', 300, { labor: 2.5 })]);
    const plain = est('flooring', [task('i1', 'lvp_floor', 200)], [task('i1', 'lvp_floor', 200)]);
    expect(laborToLearn([a], a, pb)).toEqual([]);
    expect(laborToLearn([b, a], b, pb)).toEqual([{ assemblyId: 'lvp_floor', name: 'LVP floor', unit: 'SF', rate: 2.5 }]);
    expect(laborToLearn([plain, b, a], plain, pb)).toEqual([]); // nothing set by hand on this job
    expect(laborToLearn([b, a], b, { labor: { lvp_floor: 2.5 }, materials: {} })).toEqual([]); // already their price
  });

  it('prices a job from the labor cost typed on it', () => {
    const r = buildEstimate({ jobTypeId: 'flooring', mode: 'detailed', finish: 'high', answers: { sizeSf: 100 }, customItems: [],
      work: sec([task('i1', 'lvp_floor', 100, { labor: 2 })]), markupPct: 20, minMarkupPct: 15, salesTaxPct: 0, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [] });
    expect(r.lines[0].labor).toBe(200); // as typed, whatever the finish level
  });

  it('remembers their numbers for work that is not in the price book, and what they take out and add', () => {
    const ai = [task('i1', 'cleanup_final', 1), task('i2', 'lvp_floor', 400), own('i3', 'Vapor barrier', 3, 90)];
    const final = (labor?: number) => [task('i2', 'lvp_floor', 400), own('i3', 'Vapor barrier', 2, 60, { from: 'you' }), own('u1', 'Move furniture', 2, 0, { from: 'you' }), ...(labor ? [] : [])];
    const a = est('flooring', ai, final());
    const b = est('flooring', ai, final());
    const other = est('bathroom', [task('i1', 'cleanup_final', 1)], []);
    const t = learnFromWork([a, b, other]);
    expect(t.removed).toEqual([{ jobTypeId: 'flooring', name: 'cleanup_final', times: 2 }]);
    expect(t.added).toEqual([{ jobTypeId: 'flooring', name: 'Move furniture', times: 2 }]);
    expect(t.own.find((x) => x.name === 'Vapor barrier')).toMatchObject({ hours: 2, materials: 60, unit: 'LS', times: 2 });
    const text = taughtContext(t, 'flooring');
    expect(text).toContain('took these out of your list: cleanup_final (2 jobs)');
    expect(text).toContain('added these to your list: Move furniture (2 jobs)');
    expect(text).toContain('Vapor barrier: 2 hr and $60 materials per LS');
    expect(taughtContext(t, 'bathroom')).not.toContain('took these out');
    expect(taughtContext(learnFromWork([]), 'flooring')).toBe('');
  });

  it('matches hand-set section prices across planned jobs by the section’s own name', () => {
    const q = (id: string) => ({ id, status: 'sent', updatedAt: '2026-11-20', markupPct: 20, trades: [{ trade: 's2', title: 'Tile' }], priceEdits: { s2: { price: 1100, base: 1000 } } } as unknown as Estimate);
    expect(learnFromQuotes([q('a'), q('b')], 'en').priceShifts).toEqual([{ section: 'Tile', pct: 10, times: 2 }]);
  });
});
