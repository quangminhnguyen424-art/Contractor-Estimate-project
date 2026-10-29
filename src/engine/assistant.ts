// The home-screen assistant: what Claude knows about this contractor, and the "start an estimate" action.
import { historyPerSf, presetFor } from './estimator';
import { money } from './format';
import { estimateJob, isJobTypeId, JOB_TYPES, jobType, perUnit } from './jobTypes';
import { workSummary } from './profile';
import type { Estimate, JobTypeId, PastJob, Presets, Profile } from './types';

export interface AssistantData {
  profile: Profile;
  presets: Presets;
  pastJobs: PastJob[];
  estimates: Estimate[];
}

/** Standing instructions plus the contractor's own business data, for every chat. */
export function assistantSystem(d: AssistantData, today = new Date()): string {
  const p = d.profile;
  const types = p.specialties.filter((id) => id !== 'small' && isJobTypeId(id));
  const prices = types.map((id) => {
    const jt = jobType(id);
    const per = perUnit(jt.unit);
    const h = historyPerSf(id, 'mid', d.pastJobs);
    const set = (['basic', 'mid', 'high'] as const).map((f) => `${f} ${money(presetFor(id, f, d.presets))}${per}`).join(', ');
    return `- ${jt.name} (id ${id}): ${set}${h.perSf ? `; past jobs average ${money(h.perSf)}${per} (${h.count})` : ''}`;
  });
  const recent = d.estimates.slice(0, 12).map((e) =>
    `- ${e.title} · ${estimateJob(e).name} · ${e.status} · ${money(e.price)} before tax · ${e.updatedAt.slice(0, 10)}`);
  const allTypes = JOB_TYPES.filter((j) => j.id !== 'small').map((j) => `${j.id} (${j.name})`).join(', ');

  return `You are the assistant inside a contractor's estimating app. You talk with ${p.contactName || 'the contractor'} of ${p.companyName}, a licensed contractor in Washington State. Today is ${today.toISOString().slice(0, 10)}.
Help with anything about their work and business: pricing and estimating, scope and materials, building code and permits, scheduling, client and sub communication, marketing, and general questions.

How to answer:
- They are often on a job site or driving. Be short and practical: a direct answer first, then a few short lines if needed. Plain text, no tables, no headings; short dashes for lists. Your replies may be read aloud.
- Answer in the language they write in (English or Vietnamese).
- Use their own prices and history below before any general figures. If you give general market numbers, say they are rough and vary.
- Code and permit answers: give the usual rule (IRC/IBC, NEC, WA amendments) and say to confirm with their city or county.
- Never invent facts about their jobs or clients. If you don't know, say so.
- Don't give legal or tax advice as certain; say when they should ask a lawyer or CPA.

Starting an estimate: when they describe a job they want priced, or ask you to start/make an estimate or quote, give a short reply and end with exactly one block on its own line:
[[estimate]]{"jobTypeId":"<one id from the list>","title":"<short job name>","notes":"<everything they said about the job: sizes, counts, scope, finish, client>"}[[/estimate]]
The app turns it into a button that opens the estimate with the answers filled in. Job type ids: ${allTypes}, small (repairs).

About them:
${workSummary(p.work) || '(no setup answers yet)'}
${p.about.trim() ? `In their words: ${p.about.trim()}` : ''}
Markup ${p.markupPct}% (never below ${p.minMarkupPct}%), sales tax ${p.salesTaxPct}%.
Their prices:
${prices.join('\n') || '- none set yet'}
Recent estimates:
${recent.join('\n') || '- none yet'}`;
}

export interface EstimateAction {
  jobTypeId: JobTypeId;
  title: string;
  notes: string;
}

const ACTION_RE = /\[\[estimate\]\]([\s\S]*?)\[\[\/estimate\]\]/;

/** Splits a reply into the text to show and an optional "start this estimate" action. */
export function parseAssistantReply(reply: string): { text: string; action?: EstimateAction } {
  const m = ACTION_RE.exec(reply);
  const text = reply.replace(ACTION_RE, '').trim();
  if (!m) return { text };
  try {
    const raw = JSON.parse(m[1].trim()) as Record<string, unknown>;
    const id = typeof raw.jobTypeId === 'string' && (isJobTypeId(raw.jobTypeId) || raw.jobTypeId === 'small') ? raw.jobTypeId : undefined;
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : '';
    if (!id || !notes) return { text };
    return { text, action: { jobTypeId: id, title: typeof raw.title === 'string' ? raw.title.trim().slice(0, 60) : '', notes } };
  } catch {
    return { text };
  }
}

/** Text for reading aloud: no symbols a voice would trip over. */
export function speakable(text: string): string {
  return text
    .replace(/\[\[estimate\]\][\s\S]*?\[\[\/estimate\]\]/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/(\d)\s*SF\b/g, '$1 square feet')
    .replace(/(\d)\s*LF\b/g, '$1 linear feet')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vietnamese if the text has Vietnamese letters. */
export const isVietnamese = (text: string) => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text);
