import { describe, expect, it } from 'vitest';

import { manualRoom } from './floorplan';
import { isIndoorType, suggestFromScan } from './recommend';

describe('suggestions from an indoor 3D scan', () => {
  it('suggests indoor work from the rooms scanned and never outdoor work', () => {
    const rooms = [manualRoom('a', 'Hall bath', 9, 5.5, 8, 1, 0), manualRoom('b', 'Kitchen', 14, 12, 9, 1, 2)];
    const ids = suggestFromScan(rooms).map((s) => s.jobTypeId);
    expect(ids.slice(0, 2)).toEqual(['bathroom', 'kitchen']);
    expect(ids).toContain('flooring');
    for (const id of ['roofing', 'siding', 'deck', 'fence', 'concrete', 'landscape', 'extpaint', 'gutters', 'adu', 'newbuild']) expect(ids).not.toContain(id);
    expect(suggestFromScan(rooms)[0].why).toContain('Hall bath');
  });
  it('knows which types are indoor', () => {
    expect(isIndoorType('bathroom')).toBe(true);
    expect(isIndoorType('waterheater')).toBe(true);
    expect(isIndoorType('roofing')).toBe(false);
    expect(isIndoorType('fence')).toBe(false);
    expect(suggestFromScan([])).toEqual([]);
  });
  it('a big scan suggests a whole-house remodel', () => {
    const rooms = Array.from({ length: 6 }, (_, i) => manualRoom(String(i), `Room ${i + 1}`, 15, 14, 8, 1, 1));
    expect(suggestFromScan(rooms).map((s) => s.jobTypeId)).toContain('wholehouse');
  });
});
