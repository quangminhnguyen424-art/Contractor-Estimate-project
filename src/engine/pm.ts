// Bidwell as a project manager: each morning it looks over every job and asks about what needs the contractor.
// No AI call needed; it reads the app's own records, so it is free and works offline.

import { projectBooks, COST_KINDS } from './books';
import type { Contract } from './contract';
import { dueToday, type FollowUpPlan } from './followup';
import { addDays, type CalEvent } from './schedule';
import type { SiteProject } from './site';
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

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);

export function dailyCheckIn(input: {
  projects: SiteProject[]; estimates: Estimate[]; contracts: Contract[]; profile: Profile | null; events: CalEvent[];
  team: TeamMember[]; followups: FollowUpPlan[]; today: string;
}): CheckIn[] {
  const { projects, estimates, contracts, profile, events, team, followups, today } = input;
  const out: CheckIn[] = [];

  for (const c of morningCheck(events, team, today)) {
    if (!needsCheck(c.attendance)) continue;
    out.push({
      id: `crew-${c.event.id}-${c.member.id}`, priority: 0, icon: 'people-outline',
      text: c.attendance?.state === 'late' ? `${c.member.name} is running late for ${c.event.title}. Did they make it?` : `Is ${c.member.name} coming to ${c.event.title} today${c.event.time ? ` at ${c.event.time}` : ''}?`,
      route: '/team?check=1', action: 'Check in',
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
    if (p.money?.costs.length || contract) {
      const b = projectBooks({ est, profile, contract, money: p.money ?? { salesTaxPct: null, incomeTaxPct: 30, costs: [], buy: [] }, today });
      if (b.funds.status === 'request') out.push({ id: `funds-${p.id}`, priority: 2, icon: 'cash-outline', text: `${p.title}: you've spent more than the owner has paid. Ask for the next payment?`, route: `/site/${p.id}/money`, action: 'Open' });
      if (b.owner.overdueCount) out.push({ id: `overdue-${p.id}`, priority: 2, icon: 'alert-circle-outline', text: `${p.title}: ${b.owner.overdueCount} payment${b.owner.overdueCount > 1 ? 's are' : ' is'} overdue.`, route: est ? `/estimate/${est.id}/contract` : `/site/${p.id}/money`, action: 'Remind' });
      const o = b.over[0];
      if (o) out.push({ id: `over-${p.id}`, priority: 3, icon: 'trending-up-outline', text: `${p.title}: ${COST_KINDS[o.kind].en.toLowerCase()} is ${o.pct}% over budget. Extra work for a change order?`, route: `/site/${p.id}/money`, action: 'Look' });
    }
    const last = p.lastClientUpdateAt?.slice(0, 10) ?? p.createdAt.slice(0, 10);
    if (daysBetween(last, today) >= 5) out.push({ id: `photos-${p.id}`, priority: 4, icon: 'images-outline', text: `${p.clientName || 'The client'} hasn't had a photo update on ${p.title} in ${daysBetween(last, today)} days.`, route: `/site/${p.id}/share?mode=client`, action: 'Send' });
    const flagged = p.rooms.reduce((t, r) => t + r.tasks.filter((x) => x.review && !x.done).length, 0);
    if (flagged) out.push({ id: `review-${p.id}`, priority: 3, icon: 'flag-outline', text: `${p.title}: ${flagged} task${flagged > 1 ? 's need' : ' needs'} a second look.`, route: `/site/${p.id}`, action: 'Open' });
    const yesterday = addDays(today, -1);
    const workedYesterday = events.some((e) => e.date === yesterday && (e.projectId === p.id || (!!p.estimateId && e.estimateId === p.estimateId)) && e.kind === 'crew');
    if (workedYesterday && !p.logs.some((l) => l.date === yesterday)) out.push({ id: `log-${p.id}`, priority: 5, icon: 'book-outline', text: `How did yesterday go at ${p.title}? Bidwell can write the daily log.`, route: `/site/${p.id}/log`, action: 'Write' });
  }

  for (const e of estimates) {
    if (e.status !== 'sent') continue;
    const sentDays = daysBetween(e.updatedAt.slice(0, 10), today);
    const plan = followups.find((f) => f.estimateId === e.id);
    if (!plan && sentDays >= 2) out.push({ id: `ask-${e.id}`, priority: 6, icon: 'chatbubble-ellipses-outline', text: `"${e.title}" was sent ${sentDays} days ago. Ask ${e.clientName || 'the client'} if they'd like reminders?`, route: `/estimate/${e.id}/follow`, action: 'Ask' });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
