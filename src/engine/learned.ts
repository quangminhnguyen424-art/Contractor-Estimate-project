import { ASSEMBLY_BY_ID } from './catalog';
import { rate } from './format';
import { jobType } from './jobTypes';
import type { Estimate, Lang, PriceBook, WorkItem } from './types';

/**
 * What Studwise learns about the contractor from every quote they send: the words they use, what they always leave
 * out, the section prices they change by hand, the markup they choose, and how they describe permit work. Worked out
 * from their own estimates each time (nothing extra is stored or shared), and handed to the AI so the next quote
 * sounds and prices like them.
 */

export interface Learned {
  /** Quotes that taught something (sent, signed or lost: the contractor stood behind them). */
  quotes: number;
  /** Lines of the contractor's own wording from recent quotes. */
  wording: string[];
  /** "Not included" lines they put on two or more quotes. */
  exclusions: string[];
  /** Sections they price differently from Studwise, on two or more quotes: +12 means 12% above. */
  priceShifts: { section: string; pct: number; times: number }[];
  /** Their usual markup on recent quotes. */
  markup: number | null;
  /** Permit "description of work" texts they kept. */
  permitWording: string[];
}

const SENT = new Set(['sent', 'won', 'lost']);
const SECTION_NAMES: Record<string, string> = { general: 'General conditions', extras: 'Extras' };

export function learnFromQuotes(estimates: Estimate[], lang: Lang): Learned {
  const sent = estimates.filter((e) => SENT.has(e.status)).sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt));
  const wording: string[] = [];
  const excl = new Map<string, number>();
  const shifts = new Map<string, number[]>();
  const permitWording: string[] = [];
  for (const e of sent) {
    const w = e.quoteEdits?.[lang];
    if (w && wording.length < 12) {
      if (w.scopeNote?.trim()) wording.push(w.scopeNote.trim());
      for (const s of Object.values(w.sections ?? {})) for (const line of (s.items ?? []).slice(0, 2)) if (wording.length < 12) wording.push(line);
    }
    for (const x of w?.exclusions ?? []) { const k = x.trim(); if (k) excl.set(k, (excl.get(k) ?? 0) + 1); }
    for (const [key, p] of Object.entries(e.priceEdits ?? {})) {
      // A planned job's sections go by their own names ("Tile"), so the same stage is matched across jobs.
      const name = e.trades?.find((t) => t.trade === key)?.title?.trim() || key;
      if (p.base > 0 && p.price > 0) shifts.set(name, [...(shifts.get(name) ?? []), (p.price - p.base) / p.base]);
    }
    const d = e.permit?.description?.trim();
    if (d && permitWording.length < 3) permitWording.push(d);
  }
  const recent = sent.slice(0, 10).map((e) => e.markupPct).filter((m) => Number.isFinite(m));
  const markup = recent.length >= 2 ? Math.round(recent.sort((a, b) => a - b)[Math.floor(recent.length / 2)]) : null;
  return {
    quotes: sent.length,
    wording,
    exclusions: [...excl].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([x]) => x).slice(0, 10),
    priceShifts: [...shifts].filter(([, v]) => v.length >= 2)
      .map(([k, v]) => ({ section: SECTION_NAMES[k] ?? k, pct: Math.round((v.reduce((t, x) => t + x, 0) / v.length) * 100), times: v.length }))
      .filter((s) => Math.abs(s.pct) >= 3).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8),
    markup,
    permitWording,
  };
}

/** The part of the AI's instructions that makes a quote sound like this contractor. Empty until they send quotes. */
export function learnedContext(l: Learned): string {
  const out: string[] = [];
  if (l.wording.length) out.push(`Wording this contractor used on quotes they sent (match their tone, terms and level of detail; do not copy job-specific facts):\n${l.wording.map((x) => `- ${x}`).join('\n')}`);
  if (l.exclusions.length) out.push(`They usually list as not included:\n${l.exclusions.map((x) => `- ${x}`).join('\n')}`);
  if (l.priceShifts.length) out.push(`They usually change these section prices by hand: ${l.priceShifts.map((s) => `${s.section} ${s.pct > 0 ? '+' : ''}${s.pct}% (${s.times} quotes)`).join(', ')}.`);
  if (l.markup !== null) out.push(`Their usual markup: ${l.markup}%.`);
  return out.join('\n\n');
}

// ---- What the contractor's changes to Studwise's work lists teach ----
//
// Studwise writes a work list for every job (engine/workPlan.ts) and the contractor corrects it: a labor cost they
// change, hours and materials they put on work that is not in the price book, items they take out or add. Each
// estimate keeps the list as Studwise wrote it (`workAi`) beside the one the contractor built (`work`), so what they
// keep changing is worked out from their own estimates each time. Nothing here is shared between contractors.

export interface Taught {
  /** Planned jobs looked at. */
  jobs: number;
  /** Price-book tasks whose labor cost they set by hand on two or more jobs: their number (the middle of the last three). */
  labor: { assemblyId: string; name: string; unit: string; rate: number; times: number }[];
  /** Their own numbers, per unit, for work that is not in the price book. */
  own: { name: string; unit: string; hours: number; materials: number; times: number }[];
  /** Items they took out of Studwise's list on two or more jobs of one type. */
  removed: { jobTypeId: string; name: string; times: number }[];
  /** Items they added to Studwise's list on two or more jobs of one type. */
  added: { jobTypeId: string; name: string; times: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const keyOf = (i: WorkItem) => i.assemblyId ?? `n:${i.name.trim().toLowerCase()}`;
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : r2((a[a.length / 2 - 1] + a[a.length / 2]) / 2); };

export function learnFromWork(estimates: Estimate[]): Taught {
  const planned = estimates.filter((e) => e.work?.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const labor = new Map<string, number[]>();
  const own = new Map<string, { name: string; unit: string; hours: number; materials: number; times: number }>();
  const removed = new Map<string, { jobTypeId: string; name: string; times: number }>();
  const added = new Map<string, { jobTypeId: string; name: string; times: number }>();
  const bump = (m: typeof removed, jobTypeId: string, i: WorkItem) => {
    const k = `${jobTypeId}|${keyOf(i)}`;
    const had = m.get(k);
    if (had) had.times++; else m.set(k, { jobTypeId, name: i.name, times: 1 });
  };
  for (const e of planned) {
    const items = e.work!.flatMap((s) => s.items).filter((i) => i.qty > 0);
    const seen = new Set<string>();
    for (const i of items) {
      if (i.assemblyId) {
        if (typeof i.labor === 'number' && i.labor >= 0 && !seen.has(i.assemblyId)) { seen.add(i.assemblyId); labor.set(i.assemblyId, [...(labor.get(i.assemblyId) ?? []), i.labor]); }
      } else if (i.from === 'you' && i.name.trim()) {
        // Newest job first: the first one seen is their latest number for this work.
        const k = keyOf(i);
        const had = own.get(k);
        if (had) had.times++;
        else own.set(k, { name: i.name.trim(), unit: i.unit, hours: r2((i.hours ?? 0) / i.qty), materials: r2((i.materials ?? 0) / i.qty), times: 1 });
      }
    }
    if (!e.workAi?.length) continue;
    const before = e.workAi.flatMap((s) => s.items);
    const kept = new Set(items.map((i) => i.id));
    const was = new Set(before.map((i) => i.id));
    const once = new Set<string>();
    for (const i of before) if (!kept.has(i.id) && !once.has(keyOf(i))) { once.add(keyOf(i)); bump(removed, e.jobTypeId, i); }
    once.clear();
    for (const i of items) if (!was.has(i.id) && !once.has(keyOf(i))) { once.add(keyOf(i)); bump(added, e.jobTypeId, i); }
  }
  const twice = <T extends { times: number }>(m: Map<string, T>) => [...m.values()].filter((x) => x.times >= 2).sort((a, b) => b.times - a.times).slice(0, 12);
  return {
    jobs: planned.length,
    labor: [...labor].filter(([id, v]) => v.length >= 2 && ASSEMBLY_BY_ID[id])
      .map(([id, v]) => ({ assemblyId: id, name: ASSEMBLY_BY_ID[id].name, unit: ASSEMBLY_BY_ID[id].unit, rate: median(v.slice(0, 3)), times: v.length })),
    own: [...own.values()].slice(0, 20),
    removed: twice(removed),
    added: twice(added),
  };
}

/**
 * The labor costs to move into the price book now: tasks the contractor just priced by hand on `just` and had already
 * priced by hand on an earlier job, where their number differs from the price book. From then on new estimates start
 * from it (they can change or reset it in the price book).
 */
export function laborToLearn(estimates: Estimate[], just: Estimate, pb: PriceBook): { assemblyId: string; name: string; unit: string; rate: number }[] {
  const mine = new Set((just.work ?? []).flatMap((s) => s.items).filter((i) => i.assemblyId && typeof i.labor === 'number' && i.qty > 0).map((i) => i.assemblyId!));
  if (!mine.size) return [];
  return learnFromWork(estimates).labor.filter((l) => mine.has(l.assemblyId) && Math.abs((pb.labor[l.assemblyId] ?? ASSEMBLY_BY_ID[l.assemblyId].labor) - l.rate) > 0.004)
    .map(({ assemblyId, name, unit, rate: learned }) => ({ assemblyId, name, unit, rate: learned }));
}

/** For the AI that plans the next job of this type: how this contractor corrects its lists. Empty until they have. */
export function taughtContext(t: Taught, jobTypeId: string): string {
  let jobName = 'this type of work';
  try { jobName = jobType(jobTypeId).name; } catch { /* a deleted type */ }
  const out: string[] = [];
  const rem = t.removed.filter((x) => x.jobTypeId === jobTypeId);
  const add = t.added.filter((x) => x.jobTypeId === jobTypeId);
  if (rem.length) out.push(`On earlier ${jobName} jobs this contractor took these out of your list: ${rem.map((x) => `${x.name} (${x.times} jobs)`).join('; ')}. Leave them out unless the notes ask for them.`);
  if (add.length) out.push(`On earlier ${jobName} jobs they added these to your list: ${add.map((x) => `${x.name} (${x.times} jobs)`).join('; ')}. Include them when they fit this job.`);
  if (t.own.length) {
    out.push(`Their own numbers for work that is not in the price book. When the same work comes up, write the item with these, scaled by its quantity: ${t.own
      .map((x) => `${x.name}: ${x.hours} hr and ${rate(x.materials)} materials per ${x.unit}`).join('; ')}.`);
  }
  return out.length ? `Learned from this contractor's changes to earlier work lists:\n${out.map((x) => `- ${x}`).join('\n')}` : '';
}
