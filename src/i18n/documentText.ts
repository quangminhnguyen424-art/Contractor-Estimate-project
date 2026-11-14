import type { Dict } from './core';

/**
 * Client documents in any language. Quotes, contracts, invoices and change orders are built in English (or
 * Vietnamese) by the engine. When the client reads another language, the finished document is translated here,
 * line by line, just before it is sent. Money can never change on the way: a translated line that does not carry
 * the same numbers as its source is thrown away and the English line is kept.
 */

const SKIP = /(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>|<title[\s\S]*?<\/title>|<!--[\s\S]*?-->|<[^>]+>)/gi;
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** A line worth translating: real words, and not one of the things kept as written (names, address, email). */
function wanted(text: string, keep: Set<string>): boolean {
  if (letters(text) < 2 || keep.has(norm(text))) return false;
  // "Minh Nguyen · 12 Main St": a line made only of things kept as written stays as it is (and stays on the phone).
  if (text.split(/\s*[·|—]\s*/).every((part) => letters(part) < 2 || keep.has(norm(part)))) return false;
  if (/^\S+@\S+\.\S+$/.test(text) || /^https?:\/\/\S+$/i.test(text)) return false;
  return true;
}

const keepSet = (keep: (string | undefined)[]) => new Set(keep.filter((k): k is string => !!k && !!k.trim()).map(norm));

/** Every different line of text in a document that needs translating, in the order it appears. */
export function htmlTexts(html: string, keep: (string | undefined)[] = []): string[] {
  const ks = keepSet(keep);
  const out = new Set<string>();
  html.split(SKIP).forEach((part, i) => {
    if (i % 2) return; // a tag, a style sheet, a drawing
    const text = decode(part).trim();
    if (text && wanted(text, ks)) out.add(text);
  });
  return [...out];
}

/** The same document with each line replaced by its translation. Lines without one stay as they are. */
export function applyHtml(html: string, dict: Dict, opts: { rtl?: boolean; lang?: string; note?: string } = {}): string {
  let out = html.split(SKIP).map((part, i) => {
    if (i % 2) return part;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(part);
    if (!m || !m[2]) return part;
    const t = dict[decode(m[2]).trim()];
    return t === undefined ? part : `${m[1]}${encode(t)}${m[3]}`;
  }).join('');
  if (opts.lang) out = out.replace(/<html lang="[^"]*"/, `<html lang="${opts.lang.replace(/[^\w-]/g, '')}"`);
  if (opts.rtl) out = out.replace(/<body(?=[\s>])/, '<body dir="rtl"');
  if (opts.note) {
    const block = `<p style="margin-top:20px;font-size:10px;color:#5B6168" dir="auto">${opts.note}</p>`;
    out = out.includes('</body>') ? out.replace('</body>', `${block}</body>`) : out + block;
  }
  return out;
}

/** Digits of every number in a text, in order of size, so "$16,916" and "16.916 $" count as the same number. */
const numbers = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/\D/g, '')).filter(Boolean);

/** A translation may add numbers (a month written as "11") but must keep every number of the source. */
export function keepsNumbers(source: string, translated: string): boolean {
  const have = numbers(translated);
  return numbers(source).every((n) => {
    const at = have.indexOf(n);
    if (at < 0) return false;
    have.splice(at, 1);
    return true;
  });
}

export function documentPrompt(language: string, sources: string[]): string {
  return [
    `Translate these lines from a home-improvement contractor's quote, contract, invoice or message to a client, from English into ${language}. The reader is the homeowner.`,
    'Rules:',
    '- Reply with ONLY a JSON array of strings, the same length and order as the input array.',
    '- Keep every number, amount of money, percentage and measurement exactly as written, in Western digits (0-9). Do not convert units or currency.',
    '- Keep placeholders like {0} and {1} exactly; you may move them to where they belong in the sentence.',
    '- Do not translate names of people or companies, street addresses, emails, phone numbers, links, license numbers or brand and product names. A line that is only a name or an address comes back unchanged.',
    '- Polite, clear wording a homeowner understands. Keep construction terms accurate. Do not add or leave out anything.',
    '',
    JSON.stringify(sources),
  ].join('\n');
}

const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();

/** Reads the AI's reply. A line that lost a number or a placeholder is left out, so the English line is used. */
export function readDocument(sources: string[], reply: string): Dict {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return {};
  let list: unknown;
  try { list = JSON.parse(reply.slice(start, end + 1)); } catch { return {}; }
  if (!Array.isArray(list) || list.length !== sources.length) return {};
  const out: Dict = {};
  sources.forEach((src, i) => {
    const t = list[i];
    if (typeof t === 'string' && t.trim() && t.length < src.length * 6 + 60 && keepsNumbers(src, t) && slots(src) === slots(t)) out[src] = t.trim();
  });
  return out;
}

export const TRANSLATION_NOTE = 'Translated from English for your convenience. If the two versions differ, the English version applies.';
export const escapeText = encode;
