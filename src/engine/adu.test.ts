import { describe, expect, it } from 'vitest';

import { aduCost, checkAdu } from './adu';
import { aduRules } from './aduText';
import { findParcels, readParcel } from './parcel';

describe('checkAdu', () => {
  it('Seattle NR lot: two ADUs, 1,000/1,200 SF, homes by lot size', () => {
    const r = checkAdu({ city: 'Seattle', zoning: 'NR', lotSqft: 6018, use: 'Single Family(Res Use/Zone)' });
    expect(r.verdict).toBe('yes');
    expect(r.adus).toBe(2);
    expect(r.maxSf).toBe(1000);
    expect(r.maxSfBig).toBe(1200);
    expect(r.homes).toBe(4);
    expect(r.sizes.map((s) => s.sf)).toEqual([600, 800, 1000, 1200]);
    expect(aduRules(r, 'en').join(' ')).toMatch(/1,200 SF with 3 or more bedrooms/);
    expect(aduRules(r, 'vi').join(' ')).toMatch(/phòng ngủ/);
  });

  it('a big Seattle lot allows more homes', () => {
    expect(checkAdu({ city: 'Seattle', zoning: 'NR', lotSqft: 7500 }).homes).toBe(6);
  });

  it('other cities: state minimum, likely', () => {
    const r = checkAdu({ city: 'Kent', zoning: 'NR-2', lotSqft: 3107, use: 'Single Family(Res Use/Zone)' });
    expect(r.verdict).toBe('likely');
    expect(r.adus).toBe(2);
    expect(r.homes).toBeUndefined();
    expect(r.reasons).toContain('small-lot');
    expect(checkAdu({ city: 'Federal Way', zoning: 'RS15.0', lotSqft: 14526 }).verdict).toBe('likely');
  });

  it('rural, commercial and condo lots', () => {
    expect(checkAdu({ city: 'King County', zoning: 'RA-5', lotSqft: 217800 }).verdict).toBe('check');
    expect(checkAdu({ city: 'King County', zoning: 'CB', lotSqft: 24750, use: 'Restaurant(Fast Food)' }).verdict).toBe('no');
    const condo = checkAdu({ city: 'Seattle', zoning: 'NR', lotSqft: 5000, use: 'Condominium(Residential)' });
    expect(condo.verdict).toBe('no');
    expect(condo.sizes).toEqual([]);
  });

  it('unknown zoning on a house still reads as likely outside Seattle', () => {
    expect(checkAdu({ city: 'Renton', zoning: '', lotSqft: 5000, use: 'Single Family(Res Use/Zone)' }).verdict).toBe('likely');
    expect(checkAdu({ city: 'Renton', zoning: '', lotSqft: 5000 }).verdict).toBe('check');
  });
});

describe('aduCost', () => {
  it('rounds to $5,000 and needs prices', () => {
    expect(aduCost(800, { low: 300, high: 400 })).toEqual({ low: 240000, high: 320000 });
    expect(aduCost(800, { low: 0, high: 400 })).toBeNull();
  });
});

describe('parcels', () => {
  it('reads a county record', () => {
    expect(readParcel({ PIN: '7973202665', ADDR_FULL: '10050 16TH AVE SW', CTYNAME: null, POSTALCTYNAME: 'SEATTLE', ZIP5: '98146', KCA_ZONING: 'CB', LOTSQFT: 24750, PREUSE_DESC: 'Restaurant(Fast Food)    ' }))
      .toEqual({ pin: '7973202665', address: '10050 16th Ave SW, Seattle', city: 'King County', zip: '98146', zoning: 'CB', lotSqft: 24750, use: 'Restaurant(Fast Food)' });
    expect(readParcel({ PIN: 'x' })).toBeNull();
  });

  it('finds a lot by parcel number, then by point when the match has none', async () => {
    const calls: string[] = [];
    const reply = (j: unknown) => ({ ok: true, json: async () => j });
    const row = { PIN: '0731500420', ADDR_FULL: '27120 105TH PL SE', CTYNAME: 'Kent', POSTALCTYNAME: 'KENT', ZIP5: '98030', KCA_ZONING: 'NR-2', LOTSQFT: 3107, PREUSE_DESC: 'Single Family' };
    const f = async (u: string) => {
      calls.push(u);
      if (u.includes('findAddressCandidates')) return reply({ candidates: [{ address: 'x', score: 100, location: { x: 1, y: 2 }, attributes: { User_fld: '0731500420' } }] });
      return reply({ features: [{ attributes: row }] });
    };
    const got = await findParcels('27120 105th Pl SE, Kent', f);
    expect(got[0].pin).toBe('0731500420');
    expect(calls[1]).toContain('PIN%20IN');

    const f2 = async (u: string) => {
      if (u.includes('findAddressCandidates')) return reply({ candidates: [{ address: 'x', score: 97, location: { x: 1, y: 2 }, attributes: { User_fld: '' } }] });
      return reply({ features: [{ attributes: { ...row, PIN: '1111111111', ADDR_FULL: '27100 105TH PL SE' } }, { attributes: row }] });
    };
    expect((await findParcels('27120 105th Pl SE', f2)).map((p) => p.pin)).toEqual(['0731500420']);
    expect(await findParcels('ab', f2)).toEqual([]);
  });
});
