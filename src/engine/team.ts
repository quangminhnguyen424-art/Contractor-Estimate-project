// The contractor's crew and subcontractors, who is booked on which day, and the morning check: is everyone coming?

import { addDays, type CalEvent } from './schedule';
import type { CrewLang } from './site';

export type MemberRole = 'crew' | 'sub';
export type RateUnit = 'day' | 'hour' | 'job';

export interface TeamMember {
  id: string;
  name: string;
  role: MemberRole;
  trade: string; // e.g. "Tile", "Plumbing"
  phone: string;
  /** Loaded cost (wage + taxes + insurance), used to add labor to the job when a day is worked. 0 = don't add. */
  rate: number;
  rateUnit: RateUnit;
  lang: CrewLang;
  active: boolean;
}

export type AttendState = 'coming' | 'late' | 'moved' | 'no-show' | 'worked';

export const ATTEND: Record<AttendState, { en: string; vi: string; icon: string; color: string }> = {
  coming: { en: 'Confirmed', vi: 'Xác nhận đến', icon: 'checkmark-circle-outline', color: '#34D399' },
  late: { en: 'Running late', vi: 'Đến trễ', icon: 'time-outline', color: '#FBBF24' },
  moved: { en: 'Rescheduled', vi: 'Dời ngày', icon: 'calendar-outline', color: '#38BDF8' },
  'no-show': { en: 'No-show', vi: 'Không đến', icon: 'close-circle-outline', color: '#F87171' },
  worked: { en: 'Worked', vi: 'Đã làm', icon: 'hammer-outline', color: '#A3E635' },
};

export interface Attendance {
  state: AttendState;
  at: string; // ISO time it was marked
  movedTo?: string; // YYYY-MM-DD when rescheduled
  note?: string;
  /** The labor cost added to the job for this day, so it is never added twice. */
  costId?: string;
}

export const newMember = (id: string): TeamMember => ({ id, name: '', role: 'crew', trade: '', phone: '', rate: 0, rateUnit: 'day', lang: 'en', active: true });

/** Who is booked today and still needs a check (not yet confirmed, worked, moved or marked no-show). */
export function morningCheck(events: CalEvent[], team: TeamMember[], today: string) {
  const out: { event: CalEvent; member: TeamMember; attendance?: Attendance }[] = [];
  for (const e of events) {
    if (e.date !== today || e.done || !e.crew?.length) continue;
    for (const id of e.crew) {
      const m = team.find((x) => x.id === id);
      if (m) out.push({ event: e, member: m, attendance: e.attend?.[id] });
    }
  }
  return out;
}

export const needsCheck = (a?: Attendance) => !a || a.state === 'late';

/** Labor cost for one booked day, from the member's rate. */
export function laborCost(m: TeamMember, e: Pick<CalEvent, 'durationMin'>): number {
  if (!(m.rate > 0)) return 0;
  if (m.rateUnit === 'hour') return Math.round(m.rate * Math.max(0.5, (e.durationMin || 480) / 60) * 100) / 100;
  return Math.round(m.rate * 100) / 100; // a day or a whole job
}

/** The text to confirm the day, in the worker's language. */
export function confirmText(m: TeamMember, e: CalEvent, siteTitle: string): string {
  const at = e.time ? ` ${e.time}` : '';
  const where = e.address ? ` at ${e.address}` : '';
  const first = m.name.trim().split(/\s+/)[0] || '';
  if (m.lang === 'vi') return `Chào ${first}, xác nhận hôm nay${at}${where} (${siteTitle}). Anh vẫn đến được chứ? Nếu không, cho biết ngày nào được nhé.`;
  if (m.lang === 'es') return `Hola ${first}, confirmando hoy${at}${where} (${siteTitle}). ¿Sigues viniendo? Si no, dime qué día te queda bien.`;
  return `Hi ${first}, confirming today${at}${where} (${siteTitle}). Still on? If not, tell me which day works.`;
}

/** A rescheduled day: the same booking on the new date, for that one person. */
export function movedEvent(e: CalEvent, memberId: string, date: string, id: string, now: string): CalEvent {
  return { ...e, id, date, crew: [memberId], attend: {}, done: false, notificationId: undefined, createdAt: now };
}

export const suggestDates = (today: string) => [addDays(today, 1), addDays(today, 2), addDays(today, 3)];
