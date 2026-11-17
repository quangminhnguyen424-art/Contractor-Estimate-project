import { useSyncExternalStore } from 'react';

import { learnedContext, learnFromQuotes } from '@/engine/learned';
import { readScope, scopePrompt } from '@/engine/scopeWriter';
import { quoteSections } from '@/engine/quote';
import type { Estimate, Lang, Profile, QuoteEdits } from '@/engine/types';

import { aiFor } from './host';

/** Estimates Studwise is writing a scope for right now, so the quote screen can say so. */
const writing = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useWritingScope(id: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => !!id && writing.has(id), () => false);
}

interface App {
  snapshot: () => { estimates: Estimate[]; profile: Profile | null };
  updateEstimate: (id: string, patch: { quoteEdits?: QuoteEdits | null }) => void;
  apiKey: string;
  aiAllowed: boolean;
}

/**
 * Has Studwise write the full scope of work (summary, every section, what is not included) for one estimate, in
 * the language its documents are written in. `auto`: right after the estimate is built; it stays quiet when the AI
 * is off and never replaces wording the contractor already changed. Otherwise (the contractor asked) it rewrites
 * the scope and throws with a message the screen can show.
 */
export async function writeScope(id: string, lang: Lang, app: App, auto = false): Promise<void> {
  if (writing.has(id)) return;
  const first = app.snapshot().estimates.find((e) => e.id === id);
  const profile = app.snapshot().profile;
  if (!first || !profile) return;
  if (auto && (!app.aiAllowed || first.quoteEdits?.[lang])) return;
  writing.add(id); changed();
  try {
    const keys = quoteSections(first, lang).map((s) => s.trade);
    // Every quote the contractor sent teaches Studwise their wording and what they always leave out.
    const learned = learnedContext(learnFromQuotes(app.snapshot().estimates.filter((e) => e.id !== id), lang));
    const reply = await aiFor(app.apiKey, app.aiAllowed).complete(scopePrompt(first, profile, lang, learned), undefined, 4000);
    const written = readScope(reply, keys);
    // Read again: the contractor may have edited the quote while Studwise was writing.
    const now = app.snapshot().estimates.find((e) => e.id === id);
    if (!now) return;
    if (auto && now.quoteEdits?.[lang]) return;
    const keep = now.quoteEdits?.[lang];
    const edits: QuoteEdits = { ...now.quoteEdits, [lang]: { ...written, ...(keep?.notes ? { notes: keep.notes } : {}) } };
    app.updateEstimate(id, { quoteEdits: edits });
  } catch (e) {
    if (!auto) throw e;
  } finally {
    writing.delete(id); changed();
  }
}
