// Checks saved or restored data before the app uses it, so a damaged or partial backup
// can never crash the app (and can't lock the user out on every launch).
import { JOB_TYPE_BY_ID } from '../engine/jobTypes';
import type { Estimate, JobTypeId, PastJob, PaymentMilestone, Presets, PriceBook, Profile } from '../engine/types';

export interface Persisted {
  profile: Profile | null;
  presets: Presets;
  priceBook: PriceBook;
  pastJobs: PastJob[];
  estimates: Estimate[];
}

export const EMPTY: Persisted = { profile: null, presets: {}, priceBook: { labor: {}, materials: {} }, pastJobs: [], estimates: [] };

export const DEFAULT_SCHEDULE: PaymentMilestone[] = [
  { label: 'Deposit at signing', pct: 10 },
  { label: 'Rough-in complete', pct: 40 },
  { label: 'Finishes complete', pct: 40 },
  { label: 'Final walkthrough', pct: 10 },
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isJobType = (v: unknown): v is JobTypeId => typeof v === 'string' && v in JOB_TYPE_BY_ID;

function numberMap(v: unknown): Record<string, number> {
  if (!isObj(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) as Record<string, number>;
}

export function sanitizeProfile(v: unknown): Profile | null {
  if (!isObj(v) || !str(v.companyName).trim()) return null;
  const schedule = Array.isArray(v.schedule)
    ? v.schedule.filter((m): m is PaymentMilestone => isObj(m) && typeof m.label === 'string' && typeof m.pct === 'number' && Number.isFinite(m.pct))
    : [];
  const scheduleOk = schedule.length > 0 && Math.round(schedule.reduce((t, m) => t + m.pct, 0)) === 100;
  const specialties = Array.isArray(v.specialties) ? v.specialties.filter(isJobType) : [];
  return {
    companyName: str(v.companyName), contactName: str(v.contactName), phone: str(v.phone), email: str(v.email), license: str(v.license),
    specialties: specialties.includes('small') ? specialties : [...specialties, 'small'],
    markupPct: num(v.markupPct, 20), minMarkupPct: num(v.minMarkupPct, 15), salesTaxPct: num(v.salesTaxPct, 0),
    quoteValidDays: num(v.quoteValidDays, 30), quoteLanguage: v.quoteLanguage === 'vi' ? 'vi' : 'en',
    schedule: scheduleOk ? schedule : DEFAULT_SCHEDULE,
  };
}

function sanitizePresets(v: unknown): Presets {
  if (!isObj(v)) return {};
  const out: Presets = {};
  for (const [k, p] of Object.entries(v)) {
    if (!isJobType(k) || !isObj(p)) continue;
    const d = JOB_TYPE_BY_ID[k].defaultPreset;
    out[k] = { basic: num(p.basic, d.basic), mid: num(p.mid, d.mid), high: num(p.high, d.high) };
  }
  return out;
}

function sanitizePastJob(v: unknown): PastJob | null {
  if (!isObj(v) || typeof v.id !== 'string' || !isJobType(v.jobTypeId)) return null;
  const sizeSf = num(v.sizeSf, 0);
  const price = num(v.price, 0);
  if (!(sizeSf > 0) || !(price > 0)) return null;
  return {
    id: v.id, jobTypeId: v.jobTypeId, title: str(v.title, 'Past job'), sizeSf, price,
    finish: v.finish === 'basic' || v.finish === 'high' ? v.finish : 'mid', date: str(v.date, new Date().toISOString()),
  };
}

/** An estimate is kept only if everything the screens read is present and the money is real numbers. */
function sanitizeEstimate(v: unknown): Estimate | null {
  if (!isObj(v) || typeof v.id !== 'string' || !isJobType(v.jobTypeId)) return null;
  const arrays = ['lines', 'materials', 'trades', 'checks', 'photos', 'customItems'] as const;
  if (!arrays.every((k) => Array.isArray(v[k]))) return null;
  if (!isObj(v.comparison) || !isObj(v.answers)) return null;
  const money = ['laborTotal', 'materialTotal', 'cost', 'markup', 'price', 'tax', 'total', 'markupPct', 'salesTaxPct'] as const;
  if (!money.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null;
  const e = v as unknown as Estimate;
  return {
    ...e,
    status: ['draft', 'sent', 'won', 'lost'].includes(e.status) ? e.status : 'draft',
    mode: e.mode === 'quick' ? 'quick' : 'detailed',
    finish: e.finish === 'basic' || e.finish === 'high' ? e.finish : 'mid',
    title: str(e.title, 'Untitled estimate'), clientName: str(e.clientName), address: str(e.address),
    description: str(e.description), scopeNote: str(e.scopeNote),
    aiNotes: Array.isArray(e.aiNotes) ? e.aiNotes.filter((x) => typeof x === 'string') : [],
    createdAt: str(e.createdAt, new Date().toISOString()), updatedAt: str(e.updatedAt, new Date().toISOString()),
  };
}

export interface SanitizeResult {
  data: Persisted;
  dropped: number; // how many estimates or past jobs were damaged and left out
}

export function sanitizePersisted(raw: unknown): SanitizeResult {
  if (!isObj(raw)) return { data: EMPTY, dropped: 0 };
  const estimatesIn = Array.isArray(raw.estimates) ? raw.estimates : [];
  const pastIn = Array.isArray(raw.pastJobs) ? raw.pastJobs : [];
  const estimates = estimatesIn.map(sanitizeEstimate).filter((x): x is Estimate => !!x);
  const pastJobs = pastIn.map(sanitizePastJob).filter((x): x is PastJob => !!x);
  const pb = isObj(raw.priceBook) ? raw.priceBook : {};
  return {
    data: {
      profile: sanitizeProfile(raw.profile),
      presets: sanitizePresets(raw.presets),
      priceBook: { labor: numberMap(pb.labor), materials: numberMap(pb.materials) },
      pastJobs,
      estimates,
    },
    dropped: estimatesIn.length - estimates.length + (pastIn.length - pastJobs.length),
  };
}
