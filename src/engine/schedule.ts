// The contractor's calendar: site visits, crew days, client calls and inspections, with reminders.
import { localDay } from './site';

export type EventKind = 'visit' | 'crew' | 'call' | 'inspection' | 'delivery' | 'other';

export interface CalEvent {
  id: string;
  title: string;
  kind: EventKind;
  date: string; // YYYY-MM-DD
  /** HH:MM (24h), or empty for all day. */
  time: string;
  durationMin: number;
  estimateId?: string;
  projectId?: string;
  address: string;
  notes: string;
  /** Minutes before the start to remind; null for no reminder. All-day events remind at 7:00 that morning. */
  remindMin: number | null;
  /** The phone's id for the scheduled reminder, so it can be cancelled or moved. */
  notificationId?: string;
  done: boolean;
  createdAt: string;
}

export const KINDS: Record<EventKind, { en: string; vi: string; icon: string; color: string }> = {
  visit: { en: 'Site visit', vi: 'Đi xem nhà', icon: 'home-outline', color: '#38BDF8' },
  crew: { en: 'Crew day', vi: 'Thợ vào làm', icon: 'hammer-outline', color: '#FACC15' },
  call: { en: 'Client call', vi: 'Gọi khách', icon: 'call-outline', color: '#A78BFA' },
  inspection: { en: 'Inspection', vi: 'Kiểm tra', icon: 'shield-checkmark-outline', color: '#34D399' },
  delivery: { en: 'Delivery', vi: 'Giao vật tư', icon: 'cube-outline', color: '#FB923C' },
  other: { en: 'Other', vi: 'Khác', icon: 'ellipse-outline', color: '#94A3B8' },
};

export const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 0, label: 'At start' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime());
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** The local moment an event starts (all-day events count from 7:00). */
export function startOf(e: Pick<CalEvent, 'date' | 'time'>): Date {
  const [y, m, d] = e.date.split('-').map(Number);
  const [hh, mm] = (e.time && isHm(e.time) ? e.time : '07:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** When the reminder should ring, or null (no reminder, or already in the past). */
export function reminderAt(e: Pick<CalEvent, 'date' | 'time' | 'remindMin'>, now = new Date()): Date | null {
  if (e.remindMin === null || e.remindMin === undefined) return null;
  const at = new Date(startOf(e).getTime() - e.remindMin * 60000);
  return at.getTime() > now.getTime() + 5000 ? at : null;
}

const byStart = (a: CalEvent, b: CalEvent) => startOf(a).getTime() - startOf(b).getTime() || a.title.localeCompare(b.title);

export const eventsOn = (events: CalEvent[], ymd: string) => events.filter((e) => e.date === ymd).sort(byStart);

/** What's coming up: today (including earlier today, unless done) and the next `days` days. */
export function upcoming(events: CalEvent[], today: string, days = 14): CalEvent[] {
  const end = addDays(today, days);
  return events.filter((e) => e.date >= today && e.date <= end && !e.done).sort(byStart);
}

export function timeLabel(e: Pick<CalEvent, 'time' | 'durationMin'>): string {
  if (!e.time) return 'All day';
  const [h, m] = e.time.split(':').map(Number);
  const fmt = (hh: number, mm: number) => `${((hh + 11) % 12) + 1}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
  if (!e.durationMin) return fmt(h, m);
  const endMin = h * 60 + m + e.durationMin;
  return `${fmt(h, m)} – ${fmt(Math.floor(endMin / 60) % 24, endMin % 60)}`;
}

export function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A calendar file (.ics) for one event, so it can be added to the phone's own calendar or sent to the crew. */
export function eventIcs(e: CalEvent, company: string): string {
  const s = startOf(e);
  const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const txt = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const timing = e.time
    ? `DTSTART:${stamp(s)}\r\nDTEND:${stamp(new Date(s.getTime() + (e.durationMin || 60) * 60000))}`
    : `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${txt(company || 'Bidwell AI')}//EN`, 'BEGIN:VEVENT', `UID:${e.id}@bidwell`,
    `DTSTAMP:${stamp(new Date())}`, timing, `SUMMARY:${txt(e.title)}`, e.address ? `LOCATION:${txt(e.address)}` : '', e.notes ? `DESCRIPTION:${txt(e.notes)}` : '',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
