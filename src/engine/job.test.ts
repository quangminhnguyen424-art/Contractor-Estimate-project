import { describe, expect, it } from 'vitest';

import { emptyContract, type Contract } from './contract';
import { findJob, isLive, jobStage, jobSteps, listJobs, nextStep } from './job';
import type { SitePhoto, SiteProject } from './site';
import type { Estimate, Profile } from './types';

const profile = {
  companyName: 'Upgrade Home', contactName: 'Minh', phone: '', email: '', license: '', specialties: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, quoteValidDays: 30, quoteLanguage: 'en', about: '',
  schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Final', pct: 90 }],
} as Profile;

const est = (id: string, status: Estimate['status'], extra: Partial<Estimate> = {}) => ({
  id, title: `Job ${id}`, clientName: 'Mrs Kim', address: '12 Main', price: 20000, tax: 2000, total: 22000, salesTaxPct: 10,
  status, updatedAt: '2026-11-01T10:00:00Z', finish: 'mid', lines: [], trades: [], extras: [], checks: [], jobTypeId: 'bathroom', ...extra,
}) as unknown as Estimate;

const photo = (id: string, takenAt: string): SitePhoto => ({ id, uri: `x:${id}`, w: 10, h: 10, kind: 'progress', note: '', markup: [], takenAt });
const site = (id: string, estimateId?: string, extra: Partial<SiteProject> = {}): SiteProject => ({
  id, estimateId, title: `Site ${id}`, clientName: 'Mrs Kim', address: '12 Main', status: 'active', createdAt: '2026-11-02T00:00:00Z', logs: [],
  rooms: [{ id: 'r1', name: 'Bath', notes: '', photos: [], tasks: [] }], ...extra,
});
const signed = (id: string): Contract => ({ ...emptyContract(id), accepted: { name: 'Kim', strokes: [], w: 1, h: 1, signedAt: '2026-11-03T00:00:00Z', total: 22000 } });
const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('one job from an estimate and its job site', () => {
  it('finds the same job by the estimate id or the job site id', () => {
    const es = [est('e1', 'won')];
    const ps = [site('p1', 'e1')];
    expect(findJob('e1', es, ps, [], profile)?.key).toBe('e1');
    expect(findJob('p1', es, ps, [], profile)?.key).toBe('e1');
    expect(findJob('p1', es, ps, [], profile)?.project?.id).toBe('p1');
    expect(findJob('nope', es, ps, [], profile)).toBeNull();
  });

  it('keeps photo-only jobs and lists every job once, newest first', () => {
    const jobs = listJobs([est('e1', 'draft'), est('e2', 'won', { updatedAt: '2026-11-05T00:00:00Z' })], [site('p2', 'e2'), site('p3')], [], profile);
    expect(jobs.map((j) => j.key)).toEqual(['e2', 'p3', 'e1']);
    expect(jobs.find((j) => j.key === 'p3')?.stage).toBe('site');
    expect(jobs.filter(isLive).map((j) => j.key)).toEqual(['e2', 'p3']);
  });

  it('a signed quote is won even if the status was never changed; finishing the site finishes the job', () => {
    expect(jobStage(est('e1', 'sent'), undefined, signed('e1'))).toBe('won');
    expect(jobStage(est('e1', 'won'), site('p1', 'e1', { status: 'done' }))).toBe('done');
    expect(jobStage(est('e1', 'draft'), site('p1', 'e1', { status: 'done' }))).toBe('draft');
    expect(jobStage(est('e1', 'lost'), site('p1', 'e1'))).toBe('lost');
  });

  it('shows how far along the job is', () => {
    const j = (s: Estimate['status'], c?: Contract) => findJob('e1', [est('e1', s)], [], c ? [c] : [], profile)!;
    expect(jobSteps(j('draft')).done).toBe(1);
    expect(jobSteps(j('sent')).done).toBe(2);
    expect(jobSteps(j('won')).labels[2]).toBe('Won');
    expect(jobSteps(j('sent', signed('e1')))).toEqual({ labels: ['Estimate', 'Sent', 'Signed', 'Finished'], done: 3 });
  });
});

describe('the next step on a job', () => {
  const job = (e: Estimate, p?: SiteProject, c?: Contract) => findJob(e.id, [e], p ? [p] : [], c ? [c] : [], profile)!;

  it('walks a job from draft to paid', () => {
    expect(nextStep(job(est('e1', 'draft')), NOW).kind).toBe('send');
    expect(nextStep(job(est('e1', 'draft', { checks: [{ id: 'c', level: 'warn', title: 't', detail: 'd' }] as Estimate['checks'] })), NOW).sub).toContain('1 item to check');
    const waiting = nextStep(job(est('e1', 'sent')), NOW);
    expect(waiting.kind).toBe('sign');
    expect(waiting.sub).toContain('9 days ago');
    expect(nextStep(job(est('e1', 'won')), NOW).kind).toBe('photos');
    expect(nextStep(job(est('e1', 'lost')), NOW).kind).toBe('reopen');
  });

  it('asks for money before anything else once an invoice is out', () => {
    const c: Contract = { ...signed('e1'), invoices: [{ id: 'i1', number: 1001, itemKey: 'm0', label: 'Deposit', amount: 2000, tax: 200, date: '2026-11-04', dueDate: '2026-11-11' }] };
    const step = nextStep(job(est('e1', 'won'), site('p1', 'e1'), c), NOW);
    expect(step.kind).toBe('collect');
    expect(step.title).toBe('$2,200 to collect');
  });

  it('reminds to update the client when photos are newer than the last update', () => {
    const p = site('p1', 'e1', { rooms: [{ id: 'r1', name: 'Bath', notes: '', tasks: [], photos: [photo('a', '2026-11-04T00:00:00Z')] }] });
    expect(nextStep(job(est('e1', 'won'), p), NOW).kind).toBe('update');
    expect(nextStep(job(est('e1', 'won'), { ...p, lastClientUpdateAt: '2026-11-09T00:00:00Z' }), NOW).kind).toBe('work');
  });

  it('a finished job with money left asks to collect; photo-only jobs offer the camera', () => {
    const done = site('p1', 'e1', { status: 'done' });
    expect(nextStep(job(est('e1', 'won'), done, signed('e1')), NOW).kind).toBe('collect');
    const only = findJob('p9', [], [site('p9')], [], profile)!;
    expect(nextStep(only, NOW).kind).toBe('photos');
  });
});
