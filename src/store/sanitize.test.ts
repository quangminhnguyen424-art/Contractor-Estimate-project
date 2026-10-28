import { describe, expect, it } from 'vitest';
import { cleanAnswers } from '../engine/ai';
import { DEFAULT_SCHEDULE, sanitizePersisted } from './sanitize';

describe('restoring damaged backups', () => {
  it('fills a partial profile and drops broken estimates instead of crashing later', () => {
    const r = sanitizePersisted({
      profile: { companyName: 'x' },
      estimates: [{ id: '1', status: 'draft' }, null, 'junk'],
      pastJobs: [{ id: 'p', jobTypeId: 'bathroom', sizeSf: 40, price: 20000 }, { id: 'q' }],
      priceBook: { labor: { frame_wall: 45, bad: 'x' }, materials: null },
      presets: { bathroom: { mid: 320 }, spaceship: { mid: 1 } },
    });
    expect(r.data.profile).toMatchObject({ companyName: 'x', markupPct: 20, schedule: DEFAULT_SCHEDULE, specialties: ['small'] });
    expect(r.data.estimates).toEqual([]);
    expect(r.data.pastJobs).toHaveLength(1);
    expect(r.data.priceBook).toEqual({ labor: { frame_wall: 45 }, materials: {} });
    expect(r.data.presets).toEqual({ bathroom: { basic: 280, mid: 320, high: 380 } });
    expect(r.dropped).toBe(4);
  });
  it('rejects a profile that is not an object', () => {
    expect(sanitizePersisted({ profile: 'x' }).data.profile).toBeNull();
    expect(sanitizePersisted('nope').data.profile).toBeNull();
  });
});

describe('AI answer limits', () => {
  it('drops impossible quantities', () => {
    expect(cleanAnswers('basement', { lights: 50000, newWallLf: 45, sizeSf: 900000, yearBuilt: 1962 }))
      .toEqual({ newWallLf: 45, yearBuilt: 1962 });
  });
});
