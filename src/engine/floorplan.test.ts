import { describe, expect, it } from 'vitest';

import { answersFromPlan, ftIn, manualRoom, planSvg, planTotals, roomFromScan, roomMeasures, type ScanInput } from './floorplan';
import { jobType } from './jobTypes';

// A 4 m x 3 m room (13'1" x 9'10"), 2.4 m walls, as Apple's scanner reports it: segments on the floor plane in meters.
const seg = (x1: number, y1: number, x2: number, y2: number, height = 2.4, confidence = 'high') =>
  ({ x1, y1, x2, y2, width: Math.hypot(x2 - x1, y2 - y1), height, confidence });
const scan: ScanInput = {
  walls: [seg(1, 1, 5, 1), seg(5, 1, 5, 4), seg(5, 4, 1, 4), seg(1, 4, 1, 1, 2.4, 'low')],
  doors: [seg(2, 1, 2.9, 1, 2.03)],
  windows: [seg(5, 2, 5, 3, 1.2)],
  openings: [],
  floorAreaM2: 12,
};

describe('LiDAR scan to floor plan', () => {
  const room = roomFromScan(scan, 'Primary bath', 'r1')!;
  it('converts to feet with the corner at 0,0', () => {
    expect(room).toMatchObject({ source: 'scan', lengthFt: 13.1, widthFt: 9.8, heightFt: 7.9, floorSf: 129, lowConfidence: 1 });
    expect(room.walls[0]).toMatchObject({ x1: 0, y1: 0, x2: 13.1, y2: 0 });
    expect(room.openings.map((o) => o.kind)).toEqual(['door', 'window']);
  });
  it('measures floor, net walls and baseboard', () => {
    const m = roomMeasures(room);
    expect(m.floorSf).toBe(129);
    expect(m.perimeterLf).toBe(46);
    // 45.9 LF x 7.9 ft gross, less a 3'x6'8" door and a 3.3'x3.9' window
    expect(m.wallSf).toBeGreaterThan(320);
    expect(m.wallSf).toBeLessThan(345);
    expect(m.baseboardLf).toBe(43);
    expect([m.doors, m.windows]).toEqual([1, 1]);
  });
  it('rejects a scan with too few walls or junk numbers', () => {
    expect(roomFromScan({ ...scan, walls: scan.walls.slice(0, 2) }, 'x', 'x')).toBeNull();
    expect(roomFromScan({ ...scan, walls: [...scan.walls.slice(0, 2), seg(NaN, 0, 1, 1)] }, 'x', 'x')).toBeNull();
  });
});

describe('measured rooms', () => {
  const kitchen = manualRoom('k', 'Kitchen', 12, 10, 8, 1, 2);
  it('works out a rectangle', () => {
    expect(roomMeasures(kitchen)).toEqual({ floorSf: 120, perimeterLf: 44, wallSf: 352 - 20 - 24, ceilingSf: 120, baseboardLf: 41, doors: 1, windows: 2 });
  });
  it('fills the right answers for each type of work, and none for exterior work', () => {
    const rooms = [kitchen, manualRoom('b', 'Bath', 8, 5, 8, 1, 0)];
    expect(planTotals(rooms).floorSf).toBe(160);
    expect(answersFromPlan(jobType('bathroom'), rooms).answers).toEqual({ sizeSf: 160, floorTileSf: 160 });
    expect(answersFromPlan(jobType('flooring'), rooms).answers).toMatchObject({ sizeSf: 160, baseboardLf: 41 + 23 });
    expect(answersFromPlan(jobType('drywall'), rooms).answers.sizeSf).toBe(planTotals(rooms).wallSf + 160);
    expect(answersFromPlan(jobType('roofing'), rooms).answers).toEqual({});
    expect(answersFromPlan(jobType('windows'), rooms).answers).toEqual({});
    expect(answersFromPlan(jobType('bathroom'), rooms).heard[0]).toBe('160 SF floor (floor plan)');
  });
});

describe('drawing', () => {
  it('draws every room with names escaped and wall lengths', () => {
    const svg = planSvg([roomFromScan(scan, 'Bath <2>', 'r1')!, manualRoom('k', 'Kitchen', 12, 10, 8, 1, 2)], 600);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Bath &lt;2&gt;');
    expect(svg).toContain('Kitchen');
    expect(svg).toContain(`${ftIn(13.1)}`);
    expect(svg).toContain('120 SF');
    expect(svg).not.toContain('NaN');
  });
  it('formats feet and inches', () => {
    expect(ftIn(12.33)).toBe('12\'4"');
    expect(ftIn(8)).toBe('8\'0"');
  });
});

describe('review fixes', () => {
  it('caps hand-entered counts and heights so a typo cannot freeze the app', () => {
    const r = manualRoom('x', 'Big', 10, 10, 500, 99999999, -3);
    expect(r.openings.length).toBe(50);
    expect(r.heightFt).toBe(30);
  });
  it('drops impossible saved plan data', async () => {
    const { sanitizePlan } = await import('../store/sanitize');
    const plan = sanitizePlan([
      { id: 'a', name: 'A', lengthFt: 10, widthFt: 10, heightFt: 8, floorSf: 1e15, walls: [], openings: [{ kind: 'door', widthFt: -3, heightFt: 7 }] },
      { id: 'a', name: 'dup', lengthFt: 10, widthFt: 10 },
      { id: 'b', name: 'B', lengthFt: 1e9, widthFt: 10 },
    ])!;
    expect(plan.map((r) => r.id)).toEqual(['a']);
    expect(plan[0].floorSf).toBeUndefined();
    expect(plan[0].openings).toEqual([]);
  });
});
