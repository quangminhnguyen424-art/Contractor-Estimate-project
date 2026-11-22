// Joins two copies of the workspace that both changed since they last matched (two phones of one person, or the
// people on a Team account working at the same time), item by item instead of one copy replacing the other.
//
// For every job, quote, contract, event… we know what it looked like at the last sync (as a fingerprint, `Base`):
// - changed on one side only: that side's version wins (an edit, a new item, or a delete)
// - changed on both sides: the most recently updated one wins (or this phone's, when there's no time to compare);
//   if one side deleted it and the other edited it, the edit is kept, so work is never lost silently
import type { Persisted } from '../store/sanitize';

/** Fingerprints of the workspace at the last sync: one per item of each list, one per single value. */
export interface Base { lists: Record<string, Record<string, string>>; values: Record<string, string> }

type Item = Record<string, unknown>;
const LISTS: Record<string, (x: Item) => string> = {
  estimates: (x) => String(x.id),
  projects: (x) => String(x.id),
  contracts: (x) => String(x.estimateId),
  events: (x) => String(x.id),
  pastJobs: (x) => String(x.id),
  customTypes: (x) => String(x.id),
  team: (x) => String(x.id),
  followups: (x) => String(x.estimateId),
  lessons: (x) => String(x.id),
  inbox: (x) => String(x.id),
};
const VALUES = ['profile', 'presets', 'priceBook', 'customQuestions', 'connections', 'consent'] as const;

/** Same JSON whatever the key order (the server stores objects with its own key order). Phone-only fields left out. */
function stable(v: unknown): string {
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Item;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined && k !== 'notificationId').sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

/** A short fingerprint (FNV-1a, 52 bits) so the base stays small. */
export function fingerprint(v: unknown): string {
  const s = stable(v);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}.${(h2 & 0xfffff).toString(36)}.${s.length}`;
}

export function baseOf(d: Persisted): Base {
  const rec = d as unknown as Record<string, unknown>;
  const lists: Base['lists'] = {};
  for (const [name, key] of Object.entries(LISTS)) {
    const arr = (rec[name] as Item[] | undefined) ?? [];
    lists[name] = Object.fromEntries(arr.map((x) => [key(x), fingerprint(x)]));
  }
  const values = Object.fromEntries(VALUES.map((k) => [k, fingerprint(rec[k])]));
  return { lists, values };
}

const stamp = (x: Item | undefined) => Date.parse(String(x?.updatedAt ?? x?.createdAt ?? '')) || 0;

/** Picks one side for something that existed at the last sync (`b`) or not (`b` undefined). */
function pick<T>(l: T | undefined, r: T | undefined, b: string | undefined, newer: () => 'l' | 'r'): T | undefined {
  const lf = l === undefined ? undefined : fingerprint(l);
  const rf = r === undefined ? undefined : fingerprint(r);
  if (lf === rf) return l;
  if (lf === b) return r; // only the other side changed it (or deleted it, or added it)
  if (rf === b) return l; // only this phone changed it
  if (l === undefined) return r; // deleted here, edited there: keep the edit
  if (r === undefined) return l;
  return newer() === 'l' ? l : r;
}

export function mergeWorkspaces(local: Persisted, remote: Persisted, base: Base | null): Persisted {
  const L = local as unknown as Record<string, unknown>;
  const R = remote as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...R };
  for (const [name, key] of Object.entries(LISTS)) {
    const la = (L[name] as Item[] | undefined) ?? [];
    const ra = (R[name] as Item[] | undefined) ?? [];
    const lm = new Map(la.map((x) => [key(x), x]));
    const rm = new Map(ra.map((x) => [key(x), x]));
    const bm = base?.lists[name] ?? {};
    // This phone's order first (what the person here sees), then items that only exist on the other side.
    const ids = [...new Set([...la.map(key), ...ra.map(key)])];
    const merged: Item[] = [];
    for (const id of ids) {
      const l = lm.get(id), r = rm.get(id);
      const v = pick(l, r, bm[id], () => (stamp(r) > stamp(l) ? 'r' : 'l'));
      if (v !== undefined) merged.push(v);
    }
    if (name in L || name in R) out[name] = merged;
  }
  for (const k of VALUES) {
    const v = pick(L[k], R[k], base?.values[k], () => 'l');
    if (v === undefined) delete out[k]; else out[k] = v;
  }
  // Invoice numbers only ever go up, so two people can never issue the same one.
  out.lastInvoiceNo = Math.max(Number(L.lastInvoiceNo ?? 0), Number(R.lastInvoiceNo ?? 0)) || undefined;
  if (out.lastInvoiceNo === undefined) delete out.lastInvoiceNo;
  return out as unknown as Persisted;
}
