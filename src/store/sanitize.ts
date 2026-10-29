// Checks saved or restored data before the app uses it, so a damaged or partial backup
// can never crash the app (and can't lock the user out on every launch).
import { isJobTypeId, jobType, setCustomJobs } from '../engine/jobTypes';
import type { CustomJobType, Estimate, ExtraLine, JobTypeId, PastJob, PaymentMilestone, Presets, PriceBook, PriceUnit, Profile, Question } from '../engine/types';

export interface Persisted {
  profile: Profile | null;
  presets: Presets;
  priceBook: PriceBook;
  pastJobs: PastJob[];
  estimates: Estimate[];
  /** The contractor's own types of work (typed into the blank field). */
  customTypes: CustomJobType[];
  /** Questions the contractor added, by job type id. Asked on every job of that type. */
  customQuestions: Record<string, Question[]>;
}

export const EMPTY: Persisted = {
  profile: null, presets: {}, priceBook: { labor: {}, materials: {} }, pastJobs: [], estimates: [], customTypes: [], customQuestions: {},
};

export const DEFAULT_SCHEDULE: PaymentMilestone[] = [
  { label: 'Deposit at signing', pct: 10 },
  { label: 'Rough-in complete', pct: 40 },
  { label: 'Finishes complete', pct: 40 },
  { label: 'Final walkthrough', pct: 10 },
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isJobType = (v: unknown): v is JobTypeId => isJobTypeId(v);
const UNITS: PriceUnit[] = ['SF', 'LF', 'EA', 'JOB'];

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
    about: str(v.about).slice(0, 2000),
  };
}

function sanitizePresets(v: unknown): Presets {
  if (!isObj(v)) return {};
  const out: Presets = {};
  for (const [k, p] of Object.entries(v)) {
    if (!isJobType(k) || !isObj(p)) continue;
    const d = jobType(k).defaultPreset;
    out[k] = { basic: num(p.basic, d.basic), mid: num(p.mid, d.mid), high: num(p.high, d.high) };
  }
  return out;
}

export function sanitizeCustomTypes(v: unknown): CustomJobType[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: CustomJobType[] = [];
  for (const t of v) {
    if (!isObj(t) || typeof t.id !== 'string' || !t.id.startsWith('ct_') || seen.has(t.id)) continue;
    const name = str(t.name).trim().slice(0, 60);
    if (!name) continue;
    seen.add(t.id);
    out.push({ id: t.id, name, unit: UNITS.includes(t.unit as PriceUnit) ? (t.unit as PriceUnit) : 'SF' });
  }
  return out.slice(0, 100);
}

export function sanitizeQuestion(q: unknown): Question | null {
  if (!isObj(q) || typeof q.id !== 'string' || !q.id.startsWith('cq_')) return null;
  const label = str(q.label).trim().slice(0, 120);
  if (!label) return null;
  const kind = q.kind === 'number' || q.kind === 'yesno' || q.kind === 'text' || q.kind === 'choice' ? q.kind : 'text';
  const options = kind === 'choice' && Array.isArray(q.options)
    ? q.options.filter((o): o is { value: string; label: string } => isObj(o) && typeof o.value === 'string' && typeof o.label === 'string').slice(0, 12)
    : undefined;
  if (kind === 'choice' && (!options || options.length < 2)) return null;
  const price = num(q.price, 0);
  const def = kind === 'number' ? 0 : kind === 'yesno' ? false : kind === 'choice' ? options![0].value : '';
  return {
    id: q.id, label, kind, custom: true, group: 'Your questions', default: def,
    ...(kind === 'number' && str(q.unit).trim() ? { unit: str(q.unit).trim().slice(0, 12) } : {}),
    ...(options ? { options } : {}),
    ...((kind === 'number' || kind === 'yesno') && price > 0 ? { price } : {}),
  };
}

function sanitizeCustomQuestions(v: unknown): Record<string, Question[]> {
  if (!isObj(v)) return {};
  const out: Record<string, Question[]> = {};
  for (const [k, list] of Object.entries(v)) {
    if (!isJobType(k) || !Array.isArray(list)) continue;
    const qs = list.map(sanitizeQuestion).filter((x): x is Question => !!x).slice(0, 40);
    if (qs.length) out[k] = qs;
  }
  return out;
}

const sanitizeExtras = (v: unknown): ExtraLine[] =>
  Array.isArray(v)
    ? v.filter((x): x is ExtraLine => isObj(x) && typeof x.label === 'string' && typeof x.price === 'number' && Number.isFinite(x.price)
      && typeof x.qty === 'number' && Number.isFinite(x.qty))
      .map((x) => ({ questionId: str(x.questionId), label: x.label, qty: x.qty, unit: str(x.unit), unitPrice: num(x.unitPrice, 0), price: x.price }))
    : [];

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
  // Estimates keep a deleted custom type's id: they show as "Other work" instead of disappearing.
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.jobTypeId !== 'string') return null;
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
    extras: sanitizeExtras(e.extras),
    createdAt: str(e.createdAt, new Date().toISOString()), updatedAt: str(e.updatedAt, new Date().toISOString()),
  };
}

export interface SanitizeResult {
  data: Persisted;
  dropped: number; // how many estimates or past jobs were damaged and left out
}

export function sanitizePersisted(raw: unknown): SanitizeResult {
  if (!isObj(raw)) {
    setCustomJobs([], {});
    return { data: EMPTY, dropped: 0 };
  }
  // The contractor's own types first, so everything below can refer to them.
  const customTypes = sanitizeCustomTypes(raw.customTypes);
  setCustomJobs(customTypes, {});
  const customQuestions = sanitizeCustomQuestions(raw.customQuestions);
  setCustomJobs(customTypes, customQuestions);
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
      customTypes,
      customQuestions,
    },
    dropped: estimatesIn.length - estimates.length + (pastIn.length - pastJobs.length),
  };
}
