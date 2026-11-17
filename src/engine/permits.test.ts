import { describe, expect, it } from 'vitest';

import { learnedContext, learnFromQuotes } from './learned';
import { applicationFields, cityFromAddress, jurisdictionFor, permitDescriptionPrompt, permitPlan } from './permits';
import type { Estimate, Profile } from './types';

describe('jurisdictions', () => {
  it('Seattle: SDCI for building and electrical, Public Health for plumbing, STFI for small jobs', () => {
    const j = jurisdictionFor('Seattle');
    expect(j.offices.building.name).toMatch(/SDCI/);
    expect(j.offices.electrical.name).toMatch(/SDCI/);
    expect(j.offices.plumbing.name).toMatch(/Public Health/);
    expect(j.stfi).toBe(true);
  });
  it('MyBuildingPermit cities, own-electrical cities and L&I', () => {
    const bellevue = jurisdictionFor('Bellevue');
    expect(bellevue.offices.building.name).toBe('MyBuildingPermit.com');
    expect(bellevue.offices.electrical.name).toBe('MyBuildingPermit.com');
    const kent = jurisdictionFor('kent');
    expect(kent.name).toBe('Kent');
    expect(kent.offices.electrical.name).toMatch(/L&I/);
    expect(jurisdictionFor('Tacoma').offices.electrical.name).toMatch(/Tacoma Power/);
    const uninc = jurisdictionFor('King County');
    expect(uninc.name).toBe('Unincorporated King County');
    expect(uninc.offices.plumbing.name).toMatch(/Public Health/);
    expect(uninc.offices.electrical.name).toMatch(/L&I/);
  });
  it('reads the city from a typed address', () => {
    expect(cityFromAddress('27120 105th PL SE, Kent, WA 98030')).toBe('Kent');
    expect(cityFromAddress('123 Main St, Mercer Island WA')).toBe('Mercer Island');
    expect(cityFromAddress('9336 35th Ave NE Seattle')).toBe('Seattle');
    expect(cityFromAddress('somewhere')).toBeNull();
  });
});

describe('permitPlan', () => {
  it('an ADU needs all four permits', () => {
    const p = permitPlan({ jobTypeId: 'adu', answers: {}, city: 'Seattle' });
    expect(p.items.map((i) => [i.kind, i.need])).toEqual([['building', 'required'], ['electrical', 'required'], ['plumbing', 'required'], ['mechanical', 'required']]);
    expect(p.items[0].docs.join(' ')).toMatch(/Structural/);
    expect(p.checklist.some((c) => c.id === 'issued-building')).toBe(true);
  });
  it('a panel upgrade needs only electrical; painting needs nothing', () => {
    expect(permitPlan({ jobTypeId: 'panel', answers: {}, city: 'Kent' }).items.map((i) => i.kind)).toEqual(['electrical']);
    const paint = permitPlan({ jobTypeId: 'painting', answers: {}, city: 'Kent' });
    expect(paint.none).toBe(true);
    expect(paint.checklist).toEqual([]);
  });
  it('a small Seattle remodel mentions STFI', () => {
    const p = permitPlan({ jobTypeId: 'bathroom', answers: {}, city: 'Seattle' });
    expect(p.items[0].docs.join(' ')).toMatch(/Subject-to-Field-Inspection/);
  });
});

const est = (over: Partial<Estimate> = {}): Estimate => ({
  id: 'e1', createdAt: '2026-11-01', updatedAt: '2026-11-01', status: 'sent', mode: 'detailed', jobTypeId: 'bathroom', title: 'Bath', clientName: 'Anna Lee',
  address: '1 Main St, Seattle', description: 'Gut and redo hall bath', scopeNote: '', photos: [], finish: 'mid', answers: {}, customItems: [],
  markupPct: 25, salesTaxPct: 10, extras: [], lines: [{ assemblyId: 'tile', name: 'Wall tile', vi: '', trade: 'tile', qty: 90, unit: 'SF', laborUnit: 1, labor: 1, materials: 1 }],
  materials: [], trades: [], laborTotal: 0, materialTotal: 0, cost: 0, markup: 0, price: 20000, tax: 2000, total: 22000, checks: [],
  comparison: { sizeSf: 60 } as Estimate['comparison'], ...over,
} as Estimate);

describe('application and learning', () => {
  it('fills the application from the job and the company', () => {
    const f = applicationFields(est({ permit: { parcel: { pin: '6844700205', city: 'Seattle', zoning: 'NR', lotSqft: 6018 } } }),
      { companyName: 'Upgrade Home', contactName: 'Minh', phone: '253', email: 'a@b.c', license: 'UPGRAHL123' } as Profile, { parcel: { pin: '6844700205', city: 'Seattle', zoning: 'NR', lotSqft: 6018 } }, 'Seattle');
    const v = Object.fromEntries(f.map((x) => [x.label, x.value]));
    expect(v['Parcel number (APN)']).toBe('6844700205');
    expect(v['Project value']).toBe('$20,000');
    expect(v['Contractor registration #']).toBe('UPGRAHL123');
    expect(v['Work area']).toBe('60 SF');
  });
  it('the description prompt has the work and no prices or names', () => {
    const p = permitDescriptionPrompt(est(), permitPlan({ jobTypeId: 'bathroom', answers: {}, city: 'Seattle' }).items, '- Alter SFR: remodel bath.');
    expect(p).toMatch(/Wall tile \(90 SF\)/);
    expect(p).toMatch(/Alter SFR/);
    expect(p).not.toMatch(/22,000|Anna Lee|Main St/);
  });
  it('learns wording, exclusions, price changes and markup from sent quotes only', () => {
    const q = (id: string, status: Estimate['status'], markupPct: number) => est({
      id, status, markupPct,
      quoteEdits: { en: { scopeNote: `Scope ${id}`, sections: { tile: { items: ['Schluter edges on all tile'] } }, exclusions: ['Permit fees', 'Mold remediation'] } },
      priceEdits: { tile: { price: 1100, base: 1000 } },
      permit: { description: `Alter SFR ${id}` },
    });
    const l = learnFromQuotes([q('a', 'sent', 20), q('b', 'won', 30), q('c', 'draft', 90)], 'en');
    expect(l.quotes).toBe(2);
    expect(l.exclusions).toEqual(['Permit fees', 'Mold remediation']);
    expect(l.priceShifts).toEqual([{ section: 'tile', pct: 10, times: 2 }]);
    expect(l.markup).toBe(30);
    expect(l.permitWording).toHaveLength(2);
    expect(learnedContext(l)).toMatch(/Schluter edges/);
    expect(learnedContext(learnFromQuotes([], 'en'))).toBe('');
  });
});
