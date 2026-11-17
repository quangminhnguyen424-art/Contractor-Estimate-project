import { extractJson } from './ai';
import { estimateJob, jobType } from './jobTypes';
import { quoteSections, quoteWording } from './quote';
import type { Estimate, Lang, Profile, QuoteWording } from './types';

/**
 * Studwise writes the whole scope of work for a quote: a short summary, what each section includes, and what is not
 * included, from the job's own facts (the contractor's notes, the answers, what was noticed in the photos). It never
 * sees or writes prices, and never names the client or the address.
 */

const MAX_LINE = 180;

/** The job's answers in words ("Shower: tiled walk-in"), for the AI to read. Questions left blank are skipped. */
function answersText(est: Estimate): string {
  let questions;
  try { questions = jobType(est.jobTypeId).questions; } catch { return ''; }
  const out: string[] = [];
  for (const q of questions) {
    const v = est.answers?.[q.id];
    if (v === undefined || v === null || v === '') continue;
    let shown: string;
    if (q.kind === 'choice') shown = q.options?.find((o) => o.value === v)?.label ?? String(v);
    else if (q.kind === 'yesno') shown = v ? 'yes' : 'no';
    else shown = `${v}${q.unit ? ` ${q.unit}` : ''}`;
    out.push(`- ${q.label}: ${shown}`);
  }
  return out.join('\n');
}

export function scopePrompt(est: Estimate, profile: Profile, lang: Lang, learned = ''): string {
  const jt = estimateJob(est);
  const sections = quoteSections({ ...est, quoteEdits: undefined }, lang);
  const wd = quoteWording({ ...est, quoteEdits: undefined }, profile, lang);
  const language = lang === 'vi' ? 'Vietnamese (natural, the way Vietnamese contractors in the US talk; keep common trade words in English when that is what crews say, e.g. drywall, stud, vanity)' : 'plain American English';
  const size = est.comparison.sizeSf > 0 ? ` · about ${est.comparison.sizeSf} ${jt.unit === 'JOB' ? '' : jt.unit}` : '';
  return [
    `You are an experienced Washington State general contractor writing the scope of work on a quote for a homeowner.`,
    `Job type: ${jt.name}${size} · finish level: ${est.finish} (basic, mid or high grade selections).`,
    est.description.trim() ? `The contractor's own notes about this job (use every fact in them):\n${est.description.trim().slice(0, 3000)}` : 'The contractor wrote no notes; use the answers and sections below.',
    answersText(est) ? `Answers about the job:\n${answersText(est)}` : '',
    est.aiNotes?.length ? `Seen on site or in photos:\n${est.aiNotes.map((n) => `- ${n}`).join('\n')}` : '',
    `The quote's sections (key: title — what the estimate already lists):`,
    ...sections.map((s) => `${s.trade}: ${s.title} — ${s.items.join('; ')}`),
    `Standard "not included" items for this kind of job:\n${wd.exclusions.map((e) => `- ${e}`).join('\n')}`,
    learned ? `Learned from the quotes this contractor sent before (write the way they write):\n${learned}` : '',
    '',
    'Write the full scope of work. Reply with ONLY this JSON:',
    '{"summary": "2 to 3 sentences describing the project for the homeowner", "sections": {"<key>": ["line", "line"]}, "notIncluded": ["line"]}',
    'Rules:',
    `- Write in ${language}.`,
    '- "sections": one entry for EVERY key above, 2 to 6 lines each, each line one concrete piece of work or material a homeowner can picture. Keep every quantity, size and specific item the estimate or the notes give (e.g. "Tile shower walls, waterproofed (90 SF)"). Mention what the notes say about this job in the section it belongs to.',
    '- Do not invent brands, model numbers, quantities or features that are not in the notes, answers or sections. When something is a typical assumption, say it plainly ("per plans", "mid-grade selections").',
    '- "notIncluded": keep the meaning of every standard item, and add anything this job clearly leaves out (from the notes). At most 10 lines.',
    '- No prices, costs, labor rates, markup or profit. No client names or addresses. No promises about dates or warranties. No markdown.',
  ].filter(Boolean).join('\n');
}

const clean = (x: unknown, max = MAX_LINE): string | null => {
  if (typeof x !== 'string') return null;
  const t = x.replace(/^\s*[•\-*]\s*/, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const list = (x: unknown, most: number): string[] => (Array.isArray(x) ? x.map((y) => clean(y)).filter((y): y is string => !!y).slice(0, most) : []);

/**
 * The wording for the quote from the AI's reply. Only known section keys are used; a section the reply left out
 * keeps the estimate's own lines. Throws when the reply is not the JSON asked for.
 */
export function readScope(reply: string, keys: string[]): QuoteWording {
  const raw = extractJson(reply) as { summary?: unknown; sections?: unknown; notIncluded?: unknown };
  const sections: NonNullable<QuoteWording['sections']> = {};
  if (raw.sections && typeof raw.sections === 'object') {
    for (const k of keys) {
      const items = list((raw.sections as Record<string, unknown>)[k], 8);
      if (items.length) sections[k] = { items };
    }
  }
  const summary = clean(raw.summary, 700) ?? undefined;
  const exclusions = list(raw.notIncluded, 12);
  if (!Object.keys(sections).length && !summary) throw new Error('Studwise’s scope came back empty. Try again.');
  return { ...(summary ? { scopeNote: summary } : {}), sections, ...(exclusions.length ? { exclusions } : {}) };
}
