import { describe, expect, it } from 'vitest';

import { EMPTY, type Persisted } from '../store/sanitize';

import { baseOf, fingerprint, mergeWorkspaces } from './merge';

const est = (id: string, title: string, updatedAt = '2026-11-01T00:00:00Z') => ({ id, title, updatedAt, createdAt: '2026-11-01T00:00:00Z' });
const ws = (estimates: ReturnType<typeof est>[], extra: Partial<Persisted> = {}) =>
  ({ ...EMPTY, profile: { companyName: 'Co' }, estimates, ...extra }) as unknown as Persisted;
const titles = (d: Persisted) => d.estimates.map((e) => `${e.id}:${e.title}`);

describe('joining two changed copies of the workspace', () => {
  const start = ws([est('a', 'Kitchen'), est('b', 'Bath'), est('c', 'Deck')]);
  const base = baseOf(start);

  it('keeps edits, new items and deletes made on either side', () => {
    const here = ws([est('a', 'Kitchen v2'), est('b', 'Bath'), est('c', 'Deck'), est('d', 'Roof (here)')]);
    const there = ws([est('a', 'Kitchen'), est('b', 'Bath v2'), est('e', 'Fence (there)')]); // c deleted there
    expect(titles(mergeWorkspaces(here, there, base))).toEqual(['a:Kitchen v2', 'b:Bath v2', 'd:Roof (here)', 'e:Fence (there)']);
  });

  it('the same item changed on both sides: the newer one wins', () => {
    const here = ws([est('a', 'Kitchen here', '2026-11-02T10:00:00Z'), est('b', 'Bath'), est('c', 'Deck')]);
    const there = ws([est('a', 'Kitchen there', '2026-11-02T11:00:00Z'), est('b', 'Bath'), est('c', 'Deck')]);
    expect(titles(mergeWorkspaces(here, there, base))[0]).toBe('a:Kitchen there');
    expect(titles(mergeWorkspaces(there, here, base))[0]).toBe('a:Kitchen there');
  });

  it('deleted on one side but edited on the other: the edit is kept', () => {
    const here = ws([est('a', 'Kitchen'), est('b', 'Bath')]); // c deleted here
    const there = ws([est('a', 'Kitchen'), est('b', 'Bath'), est('c', 'Deck v2')]);
    expect(titles(mergeWorkspaces(here, there, base))).toContain('c:Deck v2');
  });

  it('without a base (first sync after updating), nothing is dropped', () => {
    const here = ws([est('a', 'Kitchen'), est('x', 'Only here')]);
    const there = ws([est('a', 'Kitchen'), est('y', 'Only there')]);
    expect(titles(mergeWorkspaces(here, there, null)).sort()).toEqual(['a:Kitchen', 'x:Only here', 'y:Only there']);
  });

  it('invoice numbers never go back; fingerprints ignore key order and phone-only reminder ids', () => {
    const m = mergeWorkspaces(ws([], { lastInvoiceNo: 7 }), ws([], { lastInvoiceNo: 9 }), base);
    expect(m.lastInvoiceNo).toBe(9);
    expect(fingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(fingerprint({ b: { d: 3, c: 2 }, a: 1 }));
    expect(fingerprint({ id: 'e', notificationId: 'n1' })).toBe(fingerprint({ id: 'e' }));
  });
});
