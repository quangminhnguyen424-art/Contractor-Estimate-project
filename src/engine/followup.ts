// Follow-ups for quotes the client hasn't signed. Only with the client's permission; a schedule is required;
// "no" or STOP ends them for good; a signed or lost job ends them too.

import { addDays } from './schedule';
import type { EstimateStatus } from './types';

export type FollowConsent = 'not-asked' | 'agreed' | 'declined';
export type FollowChannel = 'text' | 'email';
export type ConsentHow = 'in person' | 'phone call' | 'text' | 'email' | 'signing page';

export interface FollowUpPlan {
  estimateId: string;
  consent: FollowConsent;
  consentAt?: string; // ISO time
  consentHow?: ConsentHow;
  phone: string;
  email: string;
  channels: FollowChannel[];
  /** Days after `startDate` to follow up, e.g. [2, 5, 10]. Required to turn follow-ups on. */
  days: number[];
  startDate: string; // YYYY-MM-DD, usually the day the quote was sent
  sent: { day: number; at: string; channel: FollowChannel }[];
  stopped?: { at: string; reason: 'declined' | 'signed' | 'lost' | 'stop' | 'manual' };
  /** The confirmations shown to both sides when the client agreed. */
  confirmedBoth?: string;
}

export const SUGGESTED_DAYS = [2, 5, 10];

export const newPlan = (estimateId: string, startDate: string): FollowUpPlan => ({
  estimateId, consent: 'not-asked', phone: '', email: '', channels: [], days: [], startDate, sent: [],
});

const PHONE = /^\+?[\d\s().-]{10,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What is missing before follow-ups can be turned on. Empty = OK. */
export function planProblems(p: FollowUpPlan): string[] {
  const out: string[] = [];
  if (p.consent !== 'agreed') out.push('The client has to agree to follow-ups first.');
  if (!p.channels.length) out.push('Pick text, email, or both.');
  if (p.channels.includes('text') && !PHONE.test(p.phone.trim())) out.push('Add the client’s mobile number.');
  if (p.channels.includes('email') && !EMAIL.test(p.email.trim())) out.push('Add the client’s email.');
  if (!p.days.length) out.push('Set when to follow up (required).');
  if (p.days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)) out.push('Each follow-up day must be between 1 and 60.');
  return out;
}

/** Cleans a typed schedule like "2, 5, 10" into sorted unique days. */
export function parseDays(text: string): number[] {
  return [...new Set(text.split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 60))].sort((a, b) => a - b).slice(0, 6);
}

export const isActive = (p: FollowUpPlan | undefined, status: EstimateStatus) =>
  !!p && p.consent === 'agreed' && !p.stopped && status === 'sent' && planProblems(p).length === 0;

/** The next follow-up still to send (the earliest one not yet sent), or null when none is left. */
export function nextFollowUp(p: FollowUpPlan | undefined, status: EstimateStatus): { day: number; date: string } | null {
  if (!p || !isActive(p, status)) return null;
  const done = new Set(p.sent.map((s) => s.day));
  const day = p.days.find((d) => !done.has(d));
  return day == null ? null : { day, date: addDays(p.startDate, day) };
}

export const dueToday = (p: FollowUpPlan | undefined, status: EstimateStatus, today: string) => {
  const n = nextFollowUp(p, status);
  return !!n && n.date <= today;
};

/** Ends follow-ups (client said no, replied STOP, signed, or the job was lost). Kept as a record. */
export const stopPlan = (p: FollowUpPlan, reason: NonNullable<FollowUpPlan['stopped']>['reason'], at: string): FollowUpPlan =>
  ({ ...p, ...(reason === 'declined' || reason === 'stop' ? { consent: 'declined' as const } : {}), stopped: { at, reason } });

/** Quiet hours: never send before 8 AM or after 8 PM (the client's local time is assumed to be the phone's). */
export const okToSendNow = (d: Date) => d.getHours() >= 8 && d.getHours() < 20;

const TITLES = /^(mr|mrs|ms|miss|mx|dr|anh|chị|chi|cô|co|chú|chu|bác|bac|ông|ong|bà|ba|sr|sra)\.?$/i;
/** How to greet the client: their first name, or the whole name when it starts with a title ("Mrs Kim"). */
export const first = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'there';
  return TITLES.test(parts[0]) ? parts.join(' ') : parts[0];
};

/** What to ask the client in person or by text, word for word, so the permission is clear. */
export function consentQuestion(company: string, client: string): string {
  return `Hi ${first(client)}, may ${company} send you a few reminders about this quote by text or email? It's up to you, and you can reply STOP at any time.`;
}

/** Confirmation messages for both sides, sent right after the client agrees. */
export function confirmations(p: FollowUpPlan, company: string, client: string, title: string): { client: string; contractor: string } {
  const how = p.channels.map((c) => (c === 'text' ? 'text' : 'email')).join(' and ');
  const when = p.days.map((d) => `day ${d}`).join(', ');
  return {
    client: `${company}: thanks ${first(client)}, you agreed to reminders about "${title}" by ${how} (${when} after the quote). Reply STOP to end them anytime.`,
    contractor: `Bidwell: ${client} agreed (${p.consentHow ?? 'in person'}) to ${how} reminders for "${title}" on ${when}. They stop automatically if the client signs, says no, or replies STOP.`,
  };
}

/** The follow-up message itself: friendly, short, with a way out. */
export function followUpText(n: number, company: string, client: string, title: string, link?: string): string {
  const open = n <= 1
    ? `Hi ${first(client)}, just checking you received the quote for ${title}. Happy to answer any questions or walk through options.`
    : n === 2
      ? `Hi ${first(client)}, any questions on the ${title} quote? I can adjust the scope or split it into phases if that helps.`
      : `Hi ${first(client)}, last check-in on the ${title} quote. If the timing isn't right, no problem, just let me know.`;
  return `${open}${link ? ` ${link}` : ''} — ${company}. Reply STOP to opt out.`;
}
