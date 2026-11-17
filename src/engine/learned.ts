import type { Estimate, Lang } from './types';

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
      if (p.base > 0 && p.price > 0) shifts.set(key, [...(shifts.get(key) ?? []), (p.price - p.base) / p.base]);
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
