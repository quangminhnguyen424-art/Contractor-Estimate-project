import { describe, expect, it } from 'vitest';

import { buildEstimate } from './estimator';
import { defaultAnswers } from './jobTypes';
import { quoteHtml, quoteSections } from './quote';
import { readScope, scopePrompt } from './scopeWriter';
import type { Estimate, Profile } from './types';

const profile = { companyName: 'Upgrade Home', contactName: 'Minh', phone: '', email: '', license: '', quoteValidDays: 30,
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, schedule: [{ label: 'Deposit at signing', pct: 100 }] } as unknown as Profile;
const dadu = (): Estimate => {
  const r = buildEstimate({ jobTypeId: 'adu', mode: 'quick', finish: 'mid', answers: { ...defaultAnswers('adu'), sizeSf: 850 }, customItems: [],
    markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: { adu: { basic: 300, mid: 325, high: 425 } } as never, pastJobs: [] });
  return { ...r, id: 'e1', jobTypeId: 'adu', mode: 'quick', finish: 'mid', answers: { sizeSf: 850 }, title: 'Phu — DADU', clientName: 'Phu Nguyen',
    address: '1206 N 157th St', description: 'Standing seam metal roof. Roll-in shower. Loft with open stair. Mini-split with 2 heads.', scopeNote: '',
    aiNotes: ['Sewer line runs under the new footprint'], photos: [], customItems: [], markupPct: 20, salesTaxPct: 10, status: 'draft',
    createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z' } as unknown as Estimate;
};

describe('Bidwell writes the scope of work', () => {
  it('asks with the job’s facts, every section, and never the price, client or address', () => {
    const p = scopePrompt(dadu(), profile, 'en');
    expect(p).toContain('Standing seam metal roof');
    expect(p).toContain('Sewer line runs under the new footprint');
    expect(p).toContain('d-foundation: Foundation');
    expect(p).not.toMatch(/\$\d|276,250|Phu Nguyen|157th/);
    expect(scopePrompt(dadu(), profile, 'vi')).toContain('Vietnamese');
  });

  it('puts the written lines into the quote; unknown sections and junk are dropped', () => {
    const est = dadu();
    const keys = quoteSections(est, 'en').map((s) => s.trade);
    const w = readScope(`Sure! {"summary": "A new 850 SF backyard cottage with a loft.", "sections": {"d-roofing": ["Standing seam metal roof", "- Gutters and downspouts", 5, ""], "d-nope": ["x"]}, "notIncluded": ["Permit fees", "Driveway"]}`, keys);
    expect(w).toEqual({ scopeNote: 'A new 850 SF backyard cottage with a loft.', sections: { 'd-roofing': { items: ['Standing seam metal roof', 'Gutters and downspouts'] } }, exclusions: ['Permit fees', 'Driveway'] });
    const html = quoteHtml({ ...est, quoteEdits: { en: w } }, profile, 'en');
    expect(html).toContain('Standing seam metal roof');
    expect(html).toContain('A new 850 SF backyard cottage');
    expect(() => readScope('no json here', keys)).toThrow();
    expect(() => readScope('{"sections": {}}', keys)).toThrow();
  });
});
