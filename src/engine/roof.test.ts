import { describe, expect, it } from 'vitest';

import { buildEstimate, type EstimateInput } from './estimator';
import { defaultAnswers } from './jobTypes';
import { measureRoof, pitchFromDeg, roofAnswers, type SolarInsights } from './roof';

const deg = (p12: number) => (Math.atan(p12 / 12) * 180) / Math.PI;
const seg = (az: number, p12: number, m2: number, h = 0) => ({
  azimuthDegrees: az, pitchDegrees: deg(p12), stats: { areaMeters2: m2, groundAreaMeters2: m2 * Math.cos(Math.atan(p12 / 12)) },
  planeHeightAtCenterMeters: h,
});
const place = { address: '1 Test St', lat: 47.3, lng: -122.3 };
const insights = (segs: ReturnType<typeof seg>[]): SolarInsights => ({ imageryDate: { year: 2025, month: 7 }, imageryQuality: 'HIGH', solarPotential: { roofSegmentStats: segs } });

describe('roof from satellite', () => {
  it('reads pitch from degrees', () => {
    expect(pitchFromDeg(26.57)).toBe(6);
    expect(pitchFromDeg(33.69)).toBe(8);
    expect(pitchFromDeg(0)).toBe(0);
  });

  it('a gable roof: two planes facing opposite ways', () => {
    const m = measureRoof(insights([seg(0, 6, 100), seg(180, 6, 100)]), place)!;
    expect(m.shape).toBe('gable');
    expect(m.pitch12).toBe(6);
    expect(m.areaSf).toBe(2153);
    expect(m.squares).toBe(21.5);
    expect(m.wastePct).toBe(10);
    expect(m.orderSquares).toBeGreaterThanOrEqual(23.6);
    expect(m.rakesLf).toBeGreaterThan(0);
    expect(m.hipLf).toBe(0);
    expect(m.imageryDate).toBe('2025-07');
  });

  it('a hip roof: four planes, four directions; a steep one adds waste', () => {
    const m = measureRoof(insights([seg(0, 9, 60), seg(90, 9, 40), seg(180, 9, 60), seg(270, 9, 40)]), place)!;
    expect(m.shape).toBe('hip');
    expect(m.rakesLf).toBe(0);
    expect(m.hipLf).toBeGreaterThan(0);
    expect(m.wastePct).toBe(17);
  });

  it('flat roofs, cut-up roofs, tiny planes and stories', () => {
    expect(measureRoof(insights([seg(0, 0.5, 150)]), place)!.shape).toBe('flat');
    const many = [0, 90, 180, 270, 45, 135, 225, 315].map((az) => seg(az, 7, 30));
    expect(measureRoof(insights([...many, seg(0, 7, 2)]), place)!.shape).toBe('complex');
    const two = measureRoof(insights([seg(0, 6, 80, 108), seg(180, 6, 80, 108)]), { ...place, groundElevationM: 100 })!;
    expect(two.stories).toBe(2);
    expect(two.heightFt).toBe(26);
    expect(measureRoof(insights([]), place)).toBeNull();
  });

  it('fills the roofing questions and prices a full roof', () => {
    const m = measureRoof(insights([seg(0, 9, 100, 104), seg(180, 9, 100, 104)]), { ...place, groundElevationM: 100 })!;
    const answers = { ...defaultAnswers('roofing'), ...roofAnswers(m) };
    expect(answers.sizeSf).toBe(2153);
    expect(answers.pitch).toBe(9);
    const input: EstimateInput = {
      jobTypeId: 'roofing', mode: 'detailed', finish: 'mid', answers, customItems: [], markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4,
      priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [],
    };
    const r = buildEstimate(input);
    const ids = r.lines.map((l) => l.assemblyId);
    for (const id of ['roof_tearoff', 'roof_dumpster', 'roof_shingles', 'roof_ice_water', 'roof_drip_edge', 'roof_ridge_cap', 'roof_steep']) expect(ids).toContain(id);
    expect(ids).not.toContain('roof_very_steep');
    const shingles = r.lines.find((l) => l.assemblyId === 'roof_shingles')!;
    expect(shingles.qty).toBeGreaterThanOrEqual(23.67); // 21.53 sq + 10% waste for a gable
    // $ per square should land in a normal Seattle-area range for a tear-off and re-roof.
    expect(r.total / (2153 / 100)).toBeGreaterThan(550);
    expect(r.total / (2153 / 100)).toBeLessThan(1400);
  });
});
