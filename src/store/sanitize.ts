// Checks saved or restored data before the app uses it, so a damaged or partial backup
// can never crash the app (and can't lock the user out on every launch).
import { isJobTypeId, jobType, setCustomJobs } from '../engine/jobTypes';
import type { ChangeOrder, ChangeStatus, Contract, Invoice, PayMethod, Payment, Signature } from '../engine/contract';
import type { CalEvent, EventKind } from '../engine/schedule';
import type { DailyLog, MarkupShape, SitePhoto, SiteProject, SiteRoom, SiteTask } from '../engine/site';
import type { CustomJobType, Estimate, ExtraLine, JobTypeId, PastJob, PaymentMilestone, PlanRoom, Presets, PriceBook, PriceUnit, Profile, Question, WorkProfile } from '../engine/types';

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
  /** Job site projects (after a job is won): rooms, photos, tasks, logs. */
  projects: SiteProject[];
  /** Signatures, change orders, invoices and payments, one per won estimate. */
  contracts: Contract[];
  /** The calendar: site visits, crew days, calls, inspections. */
  events: CalEvent[];
}

export const EMPTY: Persisted = {
  profile: null, presets: {}, priceBook: { labor: {}, materials: {} }, pastJobs: [], estimates: [], customTypes: [], customQuestions: {},
  projects: [], contracts: [], events: [],
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

const strArr = (v: unknown, max = 20) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);

function sanitizeWork(w: Record<string, unknown>): WorkProfile {
  return {
    clients: strArr(w.clients), jobSizes: strArr(w.jobSizes), subOut: strArr(w.subOut),
    ...(w.finish === 'basic' || w.finish === 'mid' || w.finish === 'high' ? { finish: w.finish } : {}),
    area: str(w.area).slice(0, 120), alwaysInclude: str(w.alwaysInclude).slice(0, 300), neverDo: str(w.neverDo).slice(0, 300),
  };
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
    ...(isObj(v.work) ? { work: sanitizeWork(v.work) } : {}),
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

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const segOk = (s: Record<string, unknown>) => fin(s.x1) && fin(s.y1) && fin(s.x2) && fin(s.y2);

/** Floor plan rooms: anything malformed is dropped rather than drawn wrong. */
export function sanitizePlan(v: unknown): PlanRoom[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const dim = (n: unknown, max = 1000): n is number => fin(n) && n > 0 && n < max;
  const coord = (n: unknown) => fin(n) && Math.abs(n) < 2000;
  const rooms = v.filter(isObj).flatMap((r): PlanRoom[] => {
    if (typeof r.id !== 'string' || seen.has(r.id) || !dim(r.lengthFt) || !dim(r.widthFt)) return [];
    seen.add(r.id);
    const walls = Array.isArray(r.walls)
      ? r.walls.slice(0, 200).filter((w): w is Record<string, number> => isObj(w) && segOk(w) && [w.x1, w.y1, w.x2, w.y2].every(coord) && dim(w.heightFt, 100))
        .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, heightFt: w.heightFt }))
      : [];
    const openings = Array.isArray(r.openings)
      ? r.openings.slice(0, 200).filter((o): o is Record<string, unknown> => isObj(o) && (o.kind === 'door' || o.kind === 'window' || o.kind === 'opening')
          && dim(o.widthFt, 100) && dim(o.heightFt, 100))
        .map((o) => ({ kind: o.kind as 'door' | 'window' | 'opening', widthFt: o.widthFt as number, heightFt: o.heightFt as number,
          ...(segOk(o) ? { x1: o.x1 as number, y1: o.y1 as number, x2: o.x2 as number, y2: o.y2 as number } : {}) }))
      : [];
    return [{
      id: r.id, name: str(r.name, 'Room').slice(0, 40), source: r.source === 'scan' && walls.length ? 'scan' : 'manual',
      lengthFt: r.lengthFt, widthFt: r.widthFt, heightFt: dim(r.heightFt, 100) ? r.heightFt : 8, walls, openings,
      ...(dim(r.floorSf, 1_000_000) ? { floorSf: r.floorSf } : {}),
      ...(fin(r.lowConfidence) ? { lowConfidence: r.lowConfidence } : {}),
    }];
  });
  return rooms.slice(0, 40);
}

const sanitizeExtras = (v: unknown): ExtraLine[] =>
  Array.isArray(v)
    ? v.filter((x): x is ExtraLine => isObj(x) && typeof x.label === 'string' && typeof x.price === 'number' && Number.isFinite(x.price)
      && typeof x.qty === 'number' && Number.isFinite(x.qty))
      .map((x) => ({ questionId: str(x.questionId), label: x.label, qty: x.qty, unit: str(x.unit), unitPrice: num(x.unitPrice, 0), price: x.price }))
    : [];

// ---- Job site ----
const KINDS = ['arrow', 'circle', 'line', 'text'] as const;
const COLORS = ['red', 'yellow', 'white'] as const;

function sanitizeShape(v: unknown): MarkupShape | null {
  if (!isObj(v) || typeof v.id !== 'string' || !KINDS.includes(v.kind as never)) return null;
  const n = (x: unknown) => (fin(x) && Math.abs(x) < 20000 ? x : null);
  const [x1, y1, x2, y2] = [n(v.x1), n(v.y1), n(v.x2), n(v.y2)];
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return { id: v.id, kind: v.kind as MarkupShape['kind'], color: COLORS.includes(v.color as never) ? (v.color as MarkupShape['color']) : 'red',
    x1, y1, x2, y2, ...(typeof v.text === 'string' && v.text.trim() ? { text: v.text.slice(0, 60) } : {}) };
}

/** Where a job photo may live: the app's photo folder, the browser's photo database, or an inline JPEG/PNG. */
const PHOTO_URI = /^(app-photo:[\w.-]+|idb:[\w-]+|file:\/\/\/[^"'<>\s]+|data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+)$/;

function sanitizePhoto(v: unknown): SitePhoto | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.uri !== 'string' || !PHOTO_URI.test(v.uri)) return null;
  const w = fin(v.w) && v.w > 0 && v.w < 20000 ? v.w : 1000;
  const h = fin(v.h) && v.h > 0 && v.h < 20000 ? v.h : 750;
  return {
    id: v.id, uri: v.uri, w, h, kind: v.kind === 'before' || v.kind === 'after' ? v.kind : 'progress', note: str(v.note).slice(0, 1000),
    markup: Array.isArray(v.markup) ? v.markup.map(sanitizeShape).filter((x): x is MarkupShape => !!x).slice(0, 100) : [],
    takenAt: str(v.takenAt, new Date().toISOString()),
  };
}

function sanitizeTask(v: unknown, photoIds: Set<string>): SiteTask | null {
  if (!isObj(v) || typeof v.id !== 'string' || !str(v.text).trim()) return null;
  const tr = isObj(v.tr) ? Object.fromEntries(Object.entries(v.tr).filter(([k, x]) => (k === 'vi' || k === 'es') && typeof x === 'string')) : undefined;
  return {
    id: v.id, text: str(v.text).trim().slice(0, 300), done: v.done === true,
    ...(v.done === true && typeof v.doneAt === 'string' ? { doneAt: v.doneAt } : {}),
    ...(tr && Object.keys(tr).length ? { tr } : {}),
    ...(typeof v.photoId === 'string' && photoIds.has(v.photoId) ? { photoId: v.photoId } : {}),
    ...(typeof v.afterPhotoId === 'string' && photoIds.has(v.afterPhotoId) ? { afterPhotoId: v.afterPhotoId } : {}),
  };
}

function sanitizeRoom(v: unknown): SiteRoom | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const photos = Array.isArray(v.photos) ? v.photos.map(sanitizePhoto).filter((x): x is SitePhoto => !!x).slice(0, 300) : [];
  const ids = new Set(photos.map((p) => p.id));
  return {
    id: v.id, name: str(v.name, 'Room').trim().slice(0, 40) || 'Room', notes: str(v.notes).slice(0, 3000), photos,
    tasks: Array.isArray(v.tasks) ? v.tasks.map((t) => sanitizeTask(t, ids)).filter((x): x is SiteTask => !!x).slice(0, 200) : [],
  };
}

export function sanitizeProjects(v: unknown): SiteProject[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((p): SiteProject[] => {
    if (!isObj(p) || typeof p.id !== 'string' || seen.has(p.id)) return [];
    seen.add(p.id);
    const logs = Array.isArray(p.logs)
      ? p.logs.filter((l): l is DailyLog => isObj(l) && typeof l.id === 'string' && typeof l.date === 'string' && typeof l.text === 'string')
        .map((l) => ({ id: l.id, date: l.date.slice(0, 10), text: l.text.slice(0, 4000) })).slice(0, 500)
      : [];
    return [{
      id: p.id, ...(typeof p.estimateId === 'string' ? { estimateId: p.estimateId } : {}),
      title: str(p.title, 'Job').trim().slice(0, 80) || 'Job', clientName: str(p.clientName).slice(0, 80), address: str(p.address).slice(0, 160),
      status: p.status === 'done' ? 'done' : 'active', createdAt: str(p.createdAt, new Date().toISOString()),
      rooms: Array.isArray(p.rooms) ? p.rooms.map(sanitizeRoom).filter((x): x is SiteRoom => !!x).slice(0, 60) : [],
      logs,
      ...(typeof p.lastClientUpdateAt === 'string' ? { lastClientUpdateAt: p.lastClientUpdateAt } : {}),
    }];
  }).slice(0, 200);
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
    plan: sanitizePlan(e.plan),
    job: isObj(e.job) && typeof e.job.name === 'string' && UNITS.includes(e.job.unit)
      ? { name: e.job.name, vi: str(e.job.vi, e.job.name), unit: e.job.unit,
          exclusions: Array.isArray(e.job.exclusions) ? e.job.exclusions.filter((x) => typeof x === 'string') : [],
          exclusionsVi: Array.isArray(e.job.exclusionsVi) ? e.job.exclusionsVi.filter((x) => typeof x === 'string') : [] }
      : undefined,
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
      projects: sanitizeProjects(raw.projects),
      contracts: sanitizeContracts(raw.contracts),
      events: sanitizeEvents(raw.events),
    },
    dropped: estimatesIn.length - estimates.length + (pastIn.length - pastJobs.length),
  };
}

// ---- Contracts and calendar ----

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown) => {
  const n = num(v, NaN);
  return Number.isFinite(n) && Math.abs(n) < 1e8 ? Math.round(n * 100) / 100 : null;
};

function sanitizeSignature(v: unknown): Signature | null {
  if (!isObj(v) || !Array.isArray(v.strokes)) return null;
  const w = num(v.w, 0), h = num(v.h, 0);
  if (!(w > 0 && w < 5000 && h > 0 && h < 5000)) return null;
  const strokes = v.strokes
    .filter((s): s is number[] => Array.isArray(s) && s.length >= 2 && s.length % 2 === 0 && s.every((x) => typeof x === 'number' && Number.isFinite(x)))
    .slice(0, 200).map((s) => s.slice(0, 2000).map((x) => Math.round(x * 10) / 10));
  if (!strokes.length) return null;
  return { name: str(v.name).trim().slice(0, 80), strokes, w, h, signedAt: str(v.signedAt, new Date().toISOString()) };
}

const PAY: PayMethod[] = ['check', 'cash', 'zelle', 'card', 'transfer', 'other'];
const CO_STATUS: ChangeStatus[] = ['pending', 'approved', 'declined'];

export function sanitizeContracts(v: unknown): Contract[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((c): Contract[] => {
    if (!isObj(c) || typeof c.estimateId !== 'string' || seen.has(c.estimateId)) return [];
    seen.add(c.estimateId);
    const accSig = sanitizeSignature(c.accepted);
    const accTotal = isObj(c.accepted) ? money(c.accepted.total) : null;
    const changeOrders = (Array.isArray(c.changeOrders) ? c.changeOrders : []).flatMap((x): ChangeOrder[] => {
      const amount = isObj(x) ? money(x.amount) : null;
      if (!isObj(x) || typeof x.id !== 'string' || amount === null) return [];
      const sig = sanitizeSignature(x.signature);
      return [{
        id: x.id, number: Math.max(1, Math.round(num(x.number, 1))), title: str(x.title, 'Change').trim().slice(0, 120) || 'Change',
        description: str(x.description).slice(0, 4000), amount, status: CO_STATUS.includes(x.status as ChangeStatus) ? (x.status as ChangeStatus) : 'pending',
        createdAt: str(x.createdAt, new Date().toISOString()), ...(typeof x.decidedAt === 'string' ? { decidedAt: x.decidedAt } : {}), ...(sig ? { signature: sig } : {}),
      }];
    }).slice(0, 200);
    const invoices = (Array.isArray(c.invoices) ? c.invoices : []).flatMap((x): Invoice[] => {
      const amount = isObj(x) ? money(x.amount) : null;
      const tax = isObj(x) ? money(x.tax) : null;
      if (!isObj(x) || typeof x.id !== 'string' || amount === null || tax === null || !YMD.test(str(x.date)) || !YMD.test(str(x.dueDate))) return [];
      return [{ id: x.id, number: Math.round(num(x.number, 1001)), date: str(x.date), dueDate: str(x.dueDate), itemKey: str(x.itemKey).slice(0, 80), label: str(x.label).slice(0, 200), amount, tax }];
    }).slice(0, 300);
    const payments = (Array.isArray(c.payments) ? c.payments : []).flatMap((x): Payment[] => {
      const amount = isObj(x) ? money(x.amount) : null;
      if (!isObj(x) || typeof x.id !== 'string' || amount === null || !(amount > 0) || !YMD.test(str(x.date))) return [];
      return [{ id: x.id, date: str(x.date), amount, method: PAY.includes(x.method as PayMethod) ? (x.method as PayMethod) : 'other', note: str(x.note).slice(0, 300) }];
    }).slice(0, 500);
    return [{ estimateId: c.estimateId, ...(accSig && accTotal !== null ? { accepted: { ...accSig, total: accTotal } } : {}), changeOrders, invoices, payments }];
  }).slice(0, 1000);
}

const KIND_IDS: EventKind[] = ['visit', 'crew', 'call', 'inspection', 'delivery', 'other'];

export function sanitizeEvents(v: unknown): CalEvent[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((e): CalEvent[] => {
    if (!isObj(e) || typeof e.id !== 'string' || seen.has(e.id) || !YMD.test(str(e.date))) return [];
    seen.add(e.id);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(str(e.time)) ? str(e.time) : '';
    const remind = e.remindMin === null ? null : num(e.remindMin, NaN);
    return [{
      id: e.id, title: str(e.title, 'Appointment').trim().slice(0, 120) || 'Appointment',
      kind: KIND_IDS.includes(e.kind as EventKind) ? (e.kind as EventKind) : 'other', date: str(e.date), time,
      durationMin: Math.max(0, Math.min(24 * 60, Math.round(num(e.durationMin, 60)))),
      ...(typeof e.estimateId === 'string' ? { estimateId: e.estimateId } : {}), ...(typeof e.projectId === 'string' ? { projectId: e.projectId } : {}),
      address: str(e.address).slice(0, 160), notes: str(e.notes).slice(0, 2000),
      remindMin: remind === null || !Number.isFinite(remind) || remind < 0 || remind > 20160 ? null : Math.round(remind),
      ...(typeof e.notificationId === 'string' ? { notificationId: e.notificationId } : {}),
      done: e.done === true, createdAt: str(e.createdAt, new Date().toISOString()),
    }];
  }).slice(0, 3000);
}
