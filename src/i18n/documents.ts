import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Dict } from './core';
import { applyHtml, documentPrompt, escapeText, htmlTexts, readDocument, TRANSLATION_NOTE } from './documentText';
import { translationAI } from './index';
import { isRtl, type Language } from './languages';

/** Translating client documents on the phone: asks the AI, remembers standard wording. The text work is in documentText.ts. */

// ── On the phone ─────────────────────────────────────────────────────────────────────────────────────────────

const BATCH = 30;
const KEEP_MAX = 3000;
const key = (code: string) => `bidwell/docs/${code}`;
const memory = new Map<string, Dict>(); // per language: everything translated since the app opened

/** Could not translate: no AI, no signal, or the day's AI limit. The caller tells the user; nothing is sent half-translated. */
export class TranslateError extends Error {}

async function known(l: Language): Promise<Dict> {
  const have = memory.get(l.code);
  if (have) return have;
  let saved: Dict = {};
  try {
    const raw = await AsyncStorage.getItem(key(l.code));
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') saved = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as Dict;
  } catch { /* start empty */ }
  memory.set(l.code, saved);
  return saved;
}

/** Standard wording (no numbers in it) comes up on every quote, so it is kept on the phone and asked only once. */
function remember(l: Language, dict: Dict) {
  const entries = Object.entries(dict).filter(([s]) => !/\d/.test(s) && s.length < 600);
  AsyncStorage.setItem(key(l.code), JSON.stringify(Object.fromEntries(entries.slice(-KEEP_MAX)))).catch(() => {});
}

/**
 * Translations for a list of lines. Asks the AI only for the ones not already known. Throws TranslateError when the
 * AI cannot be reached at all; single lines the AI got wrong (a changed number) are simply missing from the result.
 */
export async function translateLines(l: Language, sources: string[]): Promise<Dict> {
  const dict = await known(l);
  const todo = [...new Set(sources)].filter((s) => dict[s] === undefined);
  if (todo.length) {
    const ask = translationAI();
    if (!ask) throw new TranslateError('Log in to translate documents.');
    const batches: string[][] = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    const run = async (batch: string[]) => {
      let got: Dict;
      try { got = readDocument(batch, await ask(documentPrompt(l.english, batch), 6000)); } catch (e) { throw new TranslateError(e instanceof Error ? e.message : 'The AI could not be reached.'); }
      // One more try, line by line groups, for what came back wrong.
      const missed = batch.filter((s) => got[s] === undefined);
      if (missed.length && missed.length < batch.length) {
        try { got = { ...got, ...readDocument(missed, await ask(documentPrompt(l.english, missed), 6000)) }; } catch { /* keep what we have */ }
      }
      Object.assign(dict, got);
    };
    // Three at a time: a long quote takes a few calls.
    for (let i = 0; i < batches.length; i += 3) await Promise.all(batches.slice(i, i + 3).map(run));
    const still = todo.filter((s) => dict[s] === undefined).length;
    if (still > Math.max(3, todo.length * 0.25)) throw new TranslateError('The translation did not come back complete.');
    remember(l, dict);
  }
  return dict;
}

/** A finished client document in the client's language. `keep` lists what must stay as written (names, the address). */
export async function translateDocument(html: string, l: Language, keep: (string | undefined)[] = []): Promise<string> {
  const dict = await translateLines(l, [...htmlTexts(html, keep), TRANSLATION_NOTE]);
  const note = dict[TRANSLATION_NOTE];
  return applyHtml(html, dict, {
    rtl: isRtl(l), lang: l.code.startsWith('x-') ? undefined : l.code,
    note: `${note ? `${escapeText(note)}<br>` : ''}${TRANSLATION_NOTE}`,
  });
}

/** One sentence for a text or email to the client, with values dropped into {0}, {1}… after translating. */
export async function translateMessage(l: Language, template: string, ...values: string[]): Promise<string> {
  const dict = await translateLines(l, [template]);
  return (dict[template] ?? template).replace(/\{(\d+)\}/g, (_, i: string) => values[Number(i)] ?? '');
}
