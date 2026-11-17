// Studwise as a project manager: each morning it looks over every job and asks about what needs the contractor.
// No AI call needed; it reads the app's own records, so it is free and works offline.

import { projectBooks, COST_KINDS } from './books';
import { contractTotals, type Contract } from './contract';
import { dueToday, type FollowUpPlan } from './followup';
import { addDays, dayLabel, timeLabel, type CalEvent } from './schedule';
import { localDay, type SiteProject } from './site';
import { morningCheck, needsCheck, type TeamMember } from './team';
import type { Estimate, Profile } from './types';

export interface CheckIn {
  id: string;
  priority: number; // lower first
  icon: string;
  text: string;
  /** Where the button goes. */
  route: string;
  action: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);

export function dailyCheckIn(input: {
  projects: SiteProject[]; estimates: Estimate[]; contracts: Contract[]; profile: Profile | null; events: CalEvent[];
  team: TeamMember[]; followups: FollowUpPlan[]; today: string;
}): CheckIn[] {
  const { projects, estimates, contracts, profile, events, team, followups, today } = input;
  const out: CheckIn[] = [];

  for (const c of morningCheck(events, team, today)) {
    if (c.past) {
      out.push({ id: `worked-${c.event.id}-${c.member.id}`, priority: 1, icon: 'people-outline', text: `Did ${c.member.name} work on ${c.event.title}, ${dayLabel(c.event.date, today)}? Mark it so the labor reaches the job.`, route: '/team', action: 'Mark' });
      continue;
    }
    if (!needsCheck(c.attendance)) continue;
    out.push({
      id: `crew-${c.event.id}-${c.member.id}`, priority: 0, icon: 'people-outline',
      text: c.attendance?.state === 'late' ? `${c.member.name} is running late for ${c.event.title}. Did they make it?` : `Is ${c.member.name} coming to ${c.event.title} today${c.event.time ? ` at ${timeLabel({ time: c.event.time, durationMin: 0 })}` : ''}?`,
      route: '/team', action: 'Check in',
    });
  }

  for (const f of followups) {
    const est = estimates.find((e) => e.id === f.estimateId);
    if (est && dueToday(f, est.status, today)) {
      out.push({ id: `follow-${est.id}`, priority: 1, icon: 'notifications-outline', text: `Follow up with ${est.clientName || 'the client'} about "${est.title}" today.`, route: `/estimate/${est.id}/follow`, action: 'Send' });
    }
  }

  for (const p of projects.filter((x) => x.status === 'active')) {
    const est = estimates.find((e) => e.id === p.estimateId);
    const contract = contracts.find((c) => c.estimateId === p.estimateId);
    // Photos taken while pricing don't make it a running job: only won jobs (or photo-only jobs) get check-ins.
    if (est && est.status !== 'won' && !contract?.accepted) continue;
    if (p.money?.costs.length || contract) {
      const b = projectBooks({ est, profile, contract, money: p.money ?? { salesTaxPct: null, incomeTaxPct: 30, costs: [], buy: [] }, today });
      if (b.funds.status === 'request') out.push({ id: `funds-${p.id}`, priority: 2, icon: 'cash-outline', text: `${p.title}: you've spent more than the client has paid. Ask for the next payment?`, route: `/site/${p.id}/money`, action: 'Open' });
      if (b.owner.overdueCount) out.push({ id: `overdue-${p.id}`, priority: 2, icon: 'alert-circle-outline', text: `${p.title}: ${b.owner.overdueCount} payment${b.owner.overdueCount > 1 ? 's are' : ' is'} overdue.`, route: est ? `/estimate/${est.id}/contract` : `/site/${p.id}/money`, action: 'Remind' });
      const o = b.over[0];
      if (o) out.push({ id: `over-${p.id}`, priority: 3, icon: 'trending-up-outline', text: `${p.title}: ${COST_KINDS[o.kind].en.toLowerCase()} is ${o.pct}% over budget. Extra work for a change order?`, route: `/site/${p.id}/money`, action: 'Look' });
    }
    // Local days, like the rest of the app (a UTC date is tomorrow after 4 PM Pacific).
    const last = localDay(p.lastClientUpdateAt ?? p.createdAt);
    // Only when there is something new to show the client since the last update.
    const since = p.lastClientUpdateAt ?? '';
    const newPhotos = p.rooms.some((r) => r.photos.some((ph) => ph.takenAt > since));
    if (newPhotos && daysBetween(last, today) >= 3) out.push({ id: `photos-${p.id}`, priority: 4, icon: 'images-outline', text: `${p.clientName || 'The client'} hasn't had a photo update on ${p.title} in ${daysBetween(last, today)} days.`, route: `/site/${p.id}/share?mode=client`, action: 'Send' });
    const flagged = p.rooms.reduce((t, r) => t + r.tasks.filter((x) => x.review).length, 0);
    if (flagged) out.push({ id: `review-${p.id}`, priority: 3, icon: 'flag-outline', text: `${p.title}: ${flagged} task${flagged > 1 ? 's need' : ' needs'} a second look.`, route: `/job/${est?.id ?? p.id}?tab=photos`, action: 'Open' });
    const yesterday = addDays(today, -1);
    const workedYesterday = events.some((e) => e.date === yesterday && (e.projectId === p.id || (!!p.estimateId && e.estimateId === p.estimateId)) && e.kind === 'crew');
    if (workedYesterday && !p.logs.some((l) => l.date === yesterday)) out.push({ id: `log-${p.id}`, priority: 5, icon: 'book-outline', text: `How did yesterday go at ${p.title}? Studwise can write the daily log.`, route: `/site/${p.id}/log?date=${yesterday}`, action: 'Write' });
  }

  // A finished job that still has money to collect.
  for (const p of projects.filter((x) => x.status === 'done')) {
    const est = estimates.find((e) => e.id === p.estimateId);
    const contract = contracts.find((c) => c.estimateId === p.estimateId);
    if (!est || !profile || !contract) continue;
    const left = contractTotals(est, profile, contract).balance;
    if (left > 0.5) out.push({ id: `collect-${p.id}`, priority: 2, icon: 'cash-outline', text: `${p.title} is finished with ${usd(left)} left to collect.`, route: `/estimate/${est.id}/contract`, action: 'Open' });
  }

  // A quote that was priced in the last two weeks and never sent.
  const fresh = estimates.filter((e) => e.status === 'draft' && daysBetween(localDay(e.updatedAt), today) <= 14).slice(0, 2);
  for (const e of fresh) out.push({ id: `send-${e.id}`, priority: 5, icon: 'paper-plane-outline', text: `"${e.title}" is priced and not sent yet.`, route: `/job/${e.id}`, action: 'Open' });

  for (const e of estimates) {
    if (e.status !== 'sent') continue;
    const sentDays = daysBetween(localDay(e.sentAt ?? e.updatedAt), today);
    const plan = followups.find((f) => f.estimateId === e.id);
    if (!plan && sentDays >= 2) out.push({ id: `ask-${e.id}`, priority: 6, icon: 'chatbubble-ellipses-outline', text: `"${e.title}" was sent ${sentDays} days ago. Ask ${e.clientName || 'the client'} if they'd like reminders?`, route: `/estimate/${e.id}/follow`, action: 'Ask' });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
