import { describe, expect, it } from 'vitest';

import { monthWeeks, shiftMonth, startTime } from './schedule';

describe('the month calendar on a computer screen', () => {
  it('lays a month out in whole weeks, Sunday first, with the days around it filling the corners', () => {
    const weeks = monthWeeks('2026-11');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe('2026-11-01'); // November 2026 starts on a Sunday
    expect(weeks[4]).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  });

  it('starts in the month before when the first is midweek, and takes six weeks when it must', () => {
    expect(monthWeeks('2026-12')[0]).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
    expect(monthWeeks('2026-08')).toHaveLength(6); // starts on a Saturday, 31 days
    expect(monthWeeks('2026-02')).toHaveLength(4); // 28 days, Sunday to Saturday
  });

  it('steps to the next and the last month across a year end', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });

  it('writes a start time short enough for a calendar square', () => {
    expect(startTime('08:00')).toBe('8 AM');
    expect(startTime('13:30')).toBe('1:30 PM');
    expect(startTime('00:15')).toBe('12:15 AM');
    expect(startTime('')).toBe('');
  });
});
