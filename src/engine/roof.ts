// Roof measurements from satellite data (Google Solar API "building insights").
// The API gives each roof plane's sloped area, footprint, pitch and the direction it faces. From those we work out the
// roof shape, the main pitch, squares to order with waste, and estimates of eave, rake, ridge, hip and valley lengths.
// Areas and pitches are measured; edge lengths, waste and stories are estimates to check on site before ordering.

import type { Answers } from './types';

const M2_TO_SF = 10.7639;
const M_TO_FT = 3.28084;

export type RoofShape = 'flat' | 'shed' | 'gable' | 'hip' | 'complex';
export type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface RoofFacet {
  areaSf: number;
  footprintSf: number;
  /** Rise in inches per 12 inches of run, to the nearest whole number. */
  pitch12: number;
  pitchDeg: number;
  azimuth: number;
  facing: Facing;
}

export interface RoofMeasure {
  address: string;
  lat: number;
  lng: number;
  imageryDate?: string;
  quality?: string;
  /** Sloped roof area (what shingles cover). */
  areaSf: number;
  /** Area the roof covers seen from above. */
  footprintSf: number;
  squares: number;
  facets: RoofFacet[];
  /** Main pitch: the pitch covering the most roof area. */
  pitch12: number;
  pitchMin: number;
  pitchMax: number;
  shape: RoofShape;
  complexity: 'simple' | 'average' | 'cut';
  wastePct: number;
  /** Squares to order: area plus waste, rounded up to the next third of a square (one bundle). */
  orderSquares: number;
  eavesLf: number;
  rakesLf: number;
  ridgeLf: number;
  hipLf: number;
  valleyLf: number;
  heightFt?: number;
  stories?: 1 | 2 | 3;
}

export const SHAPE_LABEL: Record<RoofShape, { en: string; vi: string; note: string }> = {
  flat: { en: 'Flat / low slope', vi: 'Mái bằng / dốc thấp', note: 'Under 2/12: shingles are not allowed; use a membrane roof.' },
  shed: { en: 'Shed (one slope)', vi: 'Mái một mái dốc', note: 'One plane: high side needs wall flashing.' },
  gable: { en: 'Gable', vi: 'Mái hai mái (gable)', note: 'Two main planes with a ridge and two gable ends.' },
  hip: { en: 'Hip', vi: 'Mái bốn mái (hip)', note: 'Slopes on all four sides: more hip cap, no rakes.' },
  complex: { en: 'Complex / cut-up', vi: 'Mái phức tạp', note: 'Many planes, valleys and dormers: higher waste and labor.' },
};

const FACINGS: Facing[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const facingOf = (azimuth: number): Facing => FACINGS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
export const pitchFromDeg = (deg: number) => Math.round(Math.tan((deg * Math.PI) / 180) * 12);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

interface SolarSegment {
  pitchDegrees?: number;
  azimuthDegrees?: number;
  stats?: { areaMeters2?: number; groundAreaMeters2?: number };
  planeHeightAtCenterMeters?: number;
}
export interface SolarInsights {
  center?: { latitude?: number; longitude?: number };
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryQuality?: string;
  solarPotential?: { roofSegmentStats?: SolarSegment[]; wholeRoofStats?: { areaMeters2?: number; groundAreaMeters2?: number } };
}

/** Turns the satellite answer into roof numbers. Returns null when the satellite found no roof planes. */
export function measureRoof(insights: SolarInsights, place: { address: string; lat: number; lng: number; groundElevationM?: number }): RoofMeasure | null {
  const segs = (insights.solarPotential?.roofSegmentStats ?? []).filter((s) => (s.stats?.areaMeters2 ?? 0) > 0);
  if (!segs.length) return null;

  const all: RoofFacet[] = segs.map((s) => {
    const deg = Math.max(0, Math.min(80, s.pitchDegrees ?? 0));
    const az = s.azimuthDegrees ?? 0;
    return {
      areaSf: Math.round((s.stats?.areaMeters2 ?? 0) * M2_TO_SF),
      footprintSf: Math.round((s.stats?.groundAreaMeters2 ?? 0) * M2_TO_SF),
      pitch12: pitchFromDeg(deg), pitchDeg: Math.round(deg * 10) / 10, azimuth: Math.round(az), facing: facingOf(az),
    };
  });
  // Tiny planes (chimneys, vents, noise) are kept in the total but don't decide the shape.
  const facets = all.filter((f) => f.areaSf >= 40).sort((a, b) => b.areaSf - a.areaSf);
  const areaSf = Math.round(segs.reduce((t, s) => t + (s.stats?.areaMeters2 ?? 0), 0) * M2_TO_SF);
  const footprintSf = Math.round(segs.reduce((t, s) => t + (s.stats?.groundAreaMeters2 ?? 0), 0) * M2_TO_SF) || Math.round(areaSf * 0.9);

  // Main pitch = the pitch with the most area.
  const byPitch = new Map<number, number>();
  for (const f of facets) byPitch.set(f.pitch12, (byPitch.get(f.pitch12) ?? 0) + f.areaSf);
  const pitch12 = [...byPitch.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const pitches = facets.map((f) => f.pitch12);

  const main = facets.filter((f) => f.areaSf >= areaSf * 0.08);
  const dirs = new Set(main.map((f) => Math.round((((f.azimuth % 360) + 360) % 360) / 90) % 4));
  const shape: RoofShape = pitch12 < 2 ? 'flat'
    : main.length <= 1 ? 'shed'
    : main.length <= 3 && dirs.size === 2 ? 'gable'
    : main.length <= 6 && dirs.size === 4 ? 'hip'
    : main.length <= 2 ? 'gable'
    : 'complex';
  const complexity = shape === 'complex' || facets.length > 10 ? 'cut' : shape === 'hip' || facets.length > 4 ? 'average' : 'simple';
  const wastePct = (shape === 'flat' ? 5 : shape === 'shed' || shape === 'gable' ? 10 : shape === 'hip' ? 15 : 18) + (pitch12 >= 9 ? 2 : 0);

  // Edge lengths from the footprint, assuming a rectangle about 1.6 times as long as it is wide.
  const theta = Math.atan(pitch12 / 12);
  const L = Math.sqrt(footprintSf * 1.6);
  const W = footprintSf / L;
  const P = 2 * (L + W);
  const rise = (W / 2) * Math.tan(theta);
  const hipOne = Math.sqrt(2 * (W / 2) ** 2 + rise ** 2);
  let eaves = 0, rakes = 0, ridge = 0, hips = 0, valleys = 0;
  if (shape === 'flat') eaves = P;
  else if (shape === 'shed') { eaves = L; rakes = (2 * W) / Math.cos(theta); }
  else if (shape === 'gable') { eaves = 2 * L; rakes = (2 * W) / Math.cos(theta); ridge = L; }
  else if (shape === 'hip') { eaves = P; ridge = Math.max(0, L - W); hips = 4 * hipOne; }
  else {
    eaves = P * 1.15; rakes = P * 0.15; ridge = Math.max(0, L - W) + 0.3 * L; hips = 3 * hipOne;
    valleys = Math.max(2, main.length - 4) * (hipOne * 0.9);
  }

  const out: RoofMeasure = {
    address: place.address, lat: place.lat, lng: place.lng,
    imageryDate: insights.imageryDate?.year ? `${insights.imageryDate.year}-${String(insights.imageryDate.month ?? 1).padStart(2, '0')}` : undefined,
    quality: insights.imageryQuality,
    areaSf, footprintSf, squares: Math.round(areaSf / 10) / 10,
    facets, pitch12, pitchMin: Math.min(...pitches, pitch12), pitchMax: Math.max(...pitches, pitch12),
    shape, complexity, wastePct,
    orderSquares: Math.ceil((areaSf / 100) * (1 + wastePct / 100) * 3) / 3,
    eavesLf: roundTo(eaves, 5), rakesLf: roundTo(rakes, 5), ridgeLf: roundTo(ridge, 5), hipLf: roundTo(hips, 5), valleyLf: roundTo(valleys, 5),
  };
  // Height above the ground: the highest roof plane minus the ground's elevation.
  const top = Math.max(...segs.map((s) => s.planeHeightAtCenterMeters ?? -Infinity));
  if (Number.isFinite(top) && typeof place.groundElevationM === 'number') {
    const h = top - place.groundElevationM;
    if (h > 1 && h < 40) {
      out.heightFt = Math.round(h * M_TO_FT);
      out.stories = h <= 6.2 ? 1 : h <= 9.5 ? 2 : 3;
    }
  }
  return out;
}

/** Fills the roofing questions from a measurement (the contractor checks them after). */
export function roofAnswers(m: RoofMeasure): Answers {
  const a: Answers = {
    sizeSf: Math.round(m.areaSf), pitch: m.pitch12, complexity: m.complexity,
    eavesLf: m.eavesLf, rakesLf: m.rakesLf, ridgeLf: m.ridgeLf + m.hipLf, valleysLf: m.valleyLf,
    ventLf: Math.max(0, m.ridgeLf - 4),
  };
  if (m.stories) a.stories = String(m.stories);
  if (m.shape === 'flat') a.material = 'membrane';
  return a;
}

/** Plain-language summary for the estimate notes and the client quote's scope line. */
export function roofSummary(m: RoofMeasure): string {
  return `${SHAPE_LABEL[m.shape].en} roof, about ${m.squares} squares (${m.areaSf.toLocaleString('en-US')} SF), main pitch ${m.pitch12}/12, ${m.facets.length} planes.`;
}

/** An example measurement (a hip roof near Seattle) to show how it works before measuring a real address. */
export function exampleRoof(): RoofMeasure {
  const seg = (az: number, p12: number, m2: number) => ({
    azimuthDegrees: az, pitchDegrees: (Math.atan(p12 / 12) * 180) / Math.PI,
    stats: { areaMeters2: m2, groundAreaMeters2: m2 * Math.cos(Math.atan(p12 / 12)) }, planeHeightAtCenterMeters: 112.4,
  });
  return measureRoof(
    { imageryDate: { year: 2025, month: 6 }, imageryQuality: 'HIGH',
      solarPotential: { roofSegmentStats: [seg(178, 7, 58), seg(2, 7, 57), seg(88, 7, 31), seg(268, 7, 30), seg(180, 4, 9), seg(90, 7, 3)] } },
    { address: 'Example: 1-story hip roof, Federal Way WA', lat: 47.31, lng: -122.33, groundElevationM: 107 },
  )!;
}
