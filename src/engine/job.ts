import { contractTotals, type Contract } from './contract';
import { projectProgress, type SitePhoto, type SiteProject } from './site';
import type { Estimate, Profile } from './types';

/**
 * A job is one thing to the contractor: it starts as an estimate, becomes a sent quote, a signed job with photos and
 * money, and ends finished. Under the hood it is an estimate and (once there are photos or costs) a job site.
 * Everything here answers "where is this job, and what is the next step?" from those two records.
 */
export type JobStage = 'draft' | 'sent' | 'won' | 'done' | 'lost' | 'site';

export interface Job {
  /** The id used in the app's address for the job: the estimate's id, or the job site's id when there is no estimate. */
  key: string;
  title: string;
  client: string;
  address: string;
  est?: Estimate;
  project?: SiteProject;
  contract?: Contract;
  stage: JobStage;
  /** Short word for the list: Draft, Sent, Signed, Won, Active, Done, Lost. */
  label: string;
  /** Total the client pays (tax and approved change orders included). */
  total?: number;
  paid: number;
  due: number;
  cover?: SitePhoto;
  updated: string;
}

const latestPhoto = (p: SiteProject): SitePhoto | undefined =>
  p.rooms.flatMap((r) => r.photos).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];

/** Where a job stands. A signed quote counts as won even if the status chip was never touched. */
export function jobStage(est?: Estimate, project?: SiteProject, contract?: Contract): JobStage {
  if (!est) return project?.status === 'done' ? 'done' : 'site';
  if (est.status === 'lost') return 'lost';
  const won = est.status === 'won' || !!contract?.accepted;
  if (won && project?.status === 'done') return 'done';
  if (won) return 'won';
  return est.status === 'sent' ? 'sent' : 'draft';
}

export function stageLabel(stage: JobStage, signed: boolean): string {
  switch (stage) {
    case 'draft': return 'Draft';
    case 'sent': return 'Sent';
    case 'won': return signed ? 'Signed' : 'Won';
    case 'done': return 'Done';
    case 'lost': return 'Lost';
    default: return 'Active';
  }
}

function makeJob(est: Estimate | undefined, project: SiteProject | undefined, contracts: Contract[], profile: Profile | null): Job {
  const contract = est ? contracts.find((c) => c.estimateId === est.id) : undefined;
  const stage = jobStage(est, project, contract);
  const t = est && contract && profile ? contractTotals(est, profile, contract) : null;
  return {
    key: est?.id ?? project!.id,
    title: est?.title ?? project!.title,
    client: est?.clientName ?? project?.clientName ?? '',
    address: est?.address || project?.address || '',
    est, project, contract, stage,
    label: stageLabel(stage, !!contract?.accepted),
    total: t?.total ?? est?.total,
    paid: t?.paid ?? 0,
    due: t?.due ?? 0,
    cover: project ? latestPhoto(project) : undefined,
    updated: est?.updatedAt ?? project!.createdAt,
  };
}

/** The job behind an address: the id may be an estimate's or a job site's. */
export function findJob(id: string, estimates: Estimate[], projects: SiteProject[], contracts: Contract[], profile: Profile | null): Job | null {
  const byProject = projects.find((p) => p.id === id);
  const est = estimates.find((e) => e.id === id) ?? (byProject?.estimateId ? estimates.find((e) => e.id === byProject.estimateId) : undefined);
  const project = byProject ?? (est ? projects.find((p) => p.estimateId === est.id) : undefined);
  if (!est && !project) return null;
  return makeJob(est, project, contracts, profile);
}

/** Every job, newest first: each estimate with its job site, then job sites that have no estimate. */
export function listJobs(estimates: Estimate[], projects: SiteProject[], contracts: Contract[], profile: Profile | null): Job[] {
  const out: Job[] = estimates.map((e) => makeJob(e, projects.find((p) => p.estimateId === e.id), contracts, profile));
  for (const p of projects) {
    if (p.estimateId && estimates.some((e) => e.id === p.estimateId)) continue;
    out.push(makeJob(undefined, p, contracts, profile));
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Jobs where work is happening: won and not finished, or a photo-only job that is still open. */
export const isLive = (j: Job) => j.stage === 'won' || j.stage === 'site';

/** The four steps shown at the top of a job, and how far this job is (0–4 steps done). */
export function jobSteps(j: Job): { labels: string[]; done: number } {
  const labels = ['Estimate', 'Sent', j.contract?.accepted || j.stage === 'draft' || j.stage === 'sent' ? 'Signed' : 'Won', 'Finished'];
  const done = j.stage === 'draft' ? 1 : j.stage === 'sent' ? 2 : j.stage === 'won' ? 3 : j.stage === 'done' ? 4 : 0;
  return { labels, done };
}

export type NextKind = 'send' | 'sign' | 'photos' | 'collect' | 'update' | 'work' | 'wrap' | 'reopen' | 'estimate';

export interface NextStep { kind: NextKind; title: string; sub: string; action: string }

const DAY = 864e5;
/** The client as the contractor wrote them ("Mrs Kim"), or "the client" when no name was given. */
const first = (name: string) => name.trim() || 'the client';
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The one thing to do next on a job. Pure, so the Home list and the job page always agree. */
export function nextStep(j: Job, now = Date.now()): NextStep {
  const who = first(j.client);
  if (j.stage === 'lost') return { kind: 'reopen', title: 'This quote was lost', sub: `If ${who} comes back, reopen it and send it again.`, action: 'Reopen the quote' };
  if (!j.est) {
    return j.stage === 'done'
      ? { kind: 'wrap', title: 'Job finished', sub: 'Photos and logs stay here for your records.', action: 'See job money' }
      : { kind: 'photos', title: 'Photo-only job', sub: 'Add photos by area, or price it to send a quote.', action: 'Take photos' };
  }
  if (j.stage === 'draft') {
    const warns = j.est.checks.filter((c) => c.level === 'warn').length;
    return {
      kind: 'send', title: 'Next: send the quote',
      sub: warns ? `${warns} item${warns > 1 ? 's' : ''} to check first. Then text or email it to ${who}.` : `See what ${who} will get, then text or email it.`,
      action: 'Review and send quote',
    };
  }
  if (j.stage === 'sent') {
    const days = Math.max(0, Math.floor((now - Date.parse(j.est.sentAt ?? j.est.updatedAt)) / DAY));
    return {
      kind: 'sign', title: `Waiting for ${who} to sign`,
      sub: days ? `Sent ${days} day${days > 1 ? 's' : ''} ago. They can sign from the link, or right here on your phone.` : 'Sent today. They can sign from the link, or right here on your phone.',
      action: 'Sign on this phone',
    };
  }
  const p = j.project;
  const photos = p ? p.rooms.reduce((t, r) => t + r.photos.length, 0) : 0;
  if (j.stage === 'done') {
    const left = (j.total ?? 0) - j.paid;
    return left > 0.5
      ? { kind: 'collect', title: `${usd(left)} left to collect`, sub: 'The job is finished. Send the final invoice.', action: 'Open payments' }
      : { kind: 'wrap', title: 'Finished and paid', sub: 'Nice work. See how the job did.', action: 'See job money' };
  }
  if (j.due > 0.5) return { kind: 'collect', title: `${usd(j.due)} to collect`, sub: `An invoice is waiting on ${who}.`, action: 'Open payments' };
  if (!photos) return { kind: 'photos', title: 'You got the job', sub: 'Take “before” photos so every area has a record.', action: 'Take photos' };
  const last = p!.lastClientUpdateAt ? Date.parse(p!.lastClientUpdateAt) : 0;
  const fresh = p!.rooms.some((r) => r.photos.some((ph) => Date.parse(ph.takenAt) > last));
  if (fresh && now - (last || Date.parse(p!.createdAt)) >= 3 * DAY) {
    return { kind: 'update', title: `Keep ${who} in the loop`, sub: 'There are new photos since the last update. Bidwell writes the message.', action: 'Send a photo update' };
  }
  const pr = projectProgress(p!);
  return { kind: 'work', title: 'Work in progress', sub: pr.total ? `${pr.done} of ${pr.total} to-dos done · ${photos} photos` : `${photos} photos so far`, action: 'Take photos' };
}
