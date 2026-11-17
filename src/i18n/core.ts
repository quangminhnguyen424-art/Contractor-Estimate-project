/**
 * Turns the app's English wording into the user's language at the moment it is drawn.
 *
 * The catalog (made by scripts/i18n-extract.mjs) lists every text the app itself can show. A text that is in the
 * catalog is translated; a text that is not (a client's name, a job title, an AI answer) is the user's own content
 * and is returned untouched. Sentences with values in them are patterns, "{0} of {1} to-dos done", and the values
 * are themselves translated when they are app wording ("Draft") and left alone when they are not ("$1,200").
 */
export interface Catalog { exact: string[]; patterns: string[] }
export type Dict = Record<string, string>;

interface Pattern { src: string; re: RegExp; anchor: string; weight: number }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(src: string): Pattern {
  const parts = src.split(/\{\d+\}/);
  const re = new RegExp(`^${parts.map(escape).join('([\\s\\S]*?)')}$`);
  // The longest fixed piece: a text can only match this pattern if it contains it.
  const anchor = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
  return { src, re, anchor, weight: parts.join('').length };
}

export interface Translator {
  /** The text in the user's language, or the text itself when it is not the app's wording (or not translated yet). */
  translate(text: string): string;
  /** Whether a text is the app's own wording (as opposed to something the user typed). */
  known(text: string): boolean;
}

export function createTranslator(catalog: Catalog, dict: Dict, onMissing?: (source: string) => void): Translator {
  const exact = new Set(catalog.exact);
  // Most specific first, so "{0} of {1} to-dos done" wins over a shorter pattern that also fits.
  const patterns = catalog.patterns.map(compile).sort((a, b) => b.weight - a.weight);
  const memo = new Map<string, string>();
  const noMatch = new Set<string>();

  const find = (core: string): { p: Pattern; m: RegExpExecArray } | null => {
    if (noMatch.has(core)) return null;
    for (const p of patterns) {
      if (p.anchor && !core.includes(p.anchor)) continue;
      const m = p.re.exec(core);
      if (m) return { p, m };
    }
    if (noMatch.size > 4000) noMatch.clear();
    noMatch.add(core);
    return null;
  };

  const one = (core: string, depth: number): string => {
    const direct = dict[core];
    if (direct !== undefined) return direct;
    if (exact.has(core)) { onMissing?.(core); return core; }
    if (depth > 3 || core.length > 1500 || !/\p{L}/u.test(core)) return core;
    const hit = find(core);
    if (!hit) return pieces(core, depth);
    const t = dict[hit.p.src];
    if (t === undefined) { onMissing?.(hit.p.src); return pieces(core, depth); }
    return t.replace(/\{(\d+)\}/g, (_, i: string) => inner(hit.m[Number(i) + 1] ?? '', depth + 1));
  };

  // A line glued from pieces ("Evening, Minh", "Bathroom remodel · 45 SF · Mid-grade"): each piece by itself.
  const pieces = (core: string, depth: number): string => {
    for (const sep of [' · ', ' — ', ': ', ', ']) {
      if (!core.includes(sep)) continue;
      const parts = core.split(sep);
      if (parts.length > 8) return core;
      const out = parts.map((p) => inner(p, depth + 1));
      if (out.some((p, i) => p !== parts[i])) return out.join(sep);
    }
    return core;
  };

  // Keeps the spaces around a piece of text: "Paid " stays "Đã trả ".
  const inner = (text: string, depth: number): string => {
    const core = text.trim();
    if (!core) return text;
    const start = text.indexOf(core);
    return text.slice(0, start) + one(core, depth) + text.slice(start + core.length);
  };

  return {
    translate(text) {
      if (!text) return text;
      const seen = memo.get(text);
      if (seen !== undefined) return seen;
      const out = inner(text, 0);
      if (memo.size > 8000) memo.clear();
      memo.set(text, out);
      return out;
    },
    known(text) {
      const core = text.trim();
      return exact.has(core) || !!find(core);
    },
  };
}

/** A translation must keep every {0} of its source, or values would vanish from the sentence. */
export function keepsSlots(source: string, translated: string): boolean {
  const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
  return slots(source) === slots(translated);
}

/** What to ask the AI for a batch of texts, and how to read the answer back into a dictionary. */
export function translationPrompt(language: string, sources: string[]): string {
  return [
    `Translate the user-interface texts of a phone app for construction contractors from English into ${language}.`,
    'Rules:',
    '- Reply with ONLY a JSON array of strings, the same length and order as the input array.',
    '- Keep placeholders like {0} and {1} exactly; you may move them to where they belong in the sentence.',
    '- Keep "Studwise" and "Studwise AI", product names (QuickBooks, Zelle, Zapier, TestFlight), units (SF, LF, EA) and symbols as they are.',
    '- Use the plain, short wording a contractor in that language uses on a job site. Buttons and labels stay short.',
    '- Keep line breaks, punctuation style and capital letters at the start as in the source.',
    '',
    JSON.stringify(sources),
  ].join('\n');
}

export function readTranslations(sources: string[], reply: string): Dict {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return {};
  let list: unknown;
  try { list = JSON.parse(reply.slice(start, end + 1)); } catch { return {}; }
  if (!Array.isArray(list) || list.length !== sources.length) return {};
  const out: Dict = {};
  sources.forEach((src, i) => {
    const t = list[i];
    if (typeof t === 'string' && t.trim() && t.length < src.length * 6 + 40 && keepsSlots(src, t)) out[src] = t;
  });
  return out;
}
