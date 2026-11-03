// Job site writing tasks done by Claude, with answers checked before they reach the screen.
import type { EstimatorAI, ImageInput } from './ai';
import {
  clientUpdatePrompt, dailyLogPrompt, parseStringArray, postPrompt, stepsPrompt, translatePrompt,
  type CrewLang, type SiteProject, type SiteRoom,
} from './site';

/** A room's notes and photos turned into a task list for the crew. */
export async function stepsFor(ai: EstimatorAI, room: SiteRoom, project: SiteProject, images: ImageInput[] = []): Promise<string[]> {
  return parseStringArray(await ai.complete(stepsPrompt(room, project), images, 1500), 20);
}

const BATCH = 20;

/** Claude's list, position for position. Anything but exactly `n` items means the order can't be trusted. */
function alignedList(reply: string, n: number): (string | undefined)[] | null {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const raw: unknown = JSON.parse(reply.slice(start, end + 1));
    if (!Array.isArray(raw) || raw.length !== n) return null;
    return raw.map((x) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 300) : undefined));
  } catch {
    return null;
  }
}

/**
 * Translations in the same order, sent in small batches. An item is undefined when it could not be translated
 * reliably: the caller shows the English for it and does not save anything, so a wrong line is never kept.
 */
export async function translateAll(ai: EstimatorAI, texts: string[], lang: CrewLang): Promise<(string | undefined)[]> {
  if (lang === 'en' || texts.length === 0) return texts.map(() => undefined);
  const out: (string | undefined)[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const part = texts.slice(i, i + BATCH);
    let got: (string | undefined)[] | null = null;
    try {
      got = alignedList(await ai.complete(translatePrompt(part, lang), [], 4000), part.length);
    } catch (e) {
      if (i === 0) throw e; // nothing translated yet: let the screen say why (no connection, no key)
    }
    out.push(...(got ?? part.map(() => undefined)));
  }
  return out;
}

const plain = (s: string) => s.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();

export async function writeDailyLog(ai: EstimatorAI, p: SiteProject, date: string): Promise<string> {
  return plain(await ai.complete(dailyLogPrompt(p, date), [], 700));
}

export async function writeClientUpdate(ai: EstimatorAI, p: SiteProject, lang: 'en' | 'vi'): Promise<string> {
  return plain(await ai.complete(clientUpdatePrompt(p, lang), [], 700));
}

export async function writePost(ai: EstimatorAI, p: SiteProject, pairs: number, lang: 'en' | 'vi'): Promise<string> {
  return plain(await ai.complete(postPrompt(p, pairs, lang), [], 700));
}
