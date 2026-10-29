import { isJobTypeId } from '../engine/jobTypes';
import type { EstimateStatus, PastJob } from '../engine/types';
import type { Persisted } from './sanitize';

/**
 * Won jobs teach the app: a job marked Won is saved as a past job (price per unit, finish level), so the
 * contractor's own averages keep improving. Moving it off Won removes that past job again.
 */
export function wonToPastJobs(d: Persisted, estimateId: string, status: EstimateStatus): PastJob[] {
  const pjId = `won_${estimateId}`;
  const rest = d.pastJobs.filter((j) => j.id !== pjId);
  const e = d.estimates.find((x) => x.id === estimateId);
  if (status !== 'won' || !e || e.jobTypeId === 'small' || !isJobTypeId(e.jobTypeId)) return rest;
  const qty = e.comparison.sizeSf;
  const mainPrice = e.price - (e.extras ?? []).reduce((t, x) => t + x.price, 0);
  if (!(qty > 0) || !(mainPrice > 0)) return rest;
  return [{ id: pjId, jobTypeId: e.jobTypeId, title: e.title, sizeSf: qty, price: mainPrice, finish: e.finish, date: new Date().toISOString() }, ...rest];
}
