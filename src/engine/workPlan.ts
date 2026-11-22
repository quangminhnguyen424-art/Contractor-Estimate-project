// The work Studwise plans for one job: its own sections ("Demo & site cleanup", "Tile", "Plumbing"…) and the items
// under each. Nothing here is a template: the AI writes the list for the job in front of it, from the contractor's
// notes, the photos and the size. Money still comes from the contractor: a task that is in their price book is priced
// from it, and anything else is their labor cost per hour × the hours, plus what the materials cost them.
import { ASSEMBLIES, ASSEMBLY_BY_ID, TRADE_NAMES, TRADE_ORDER } from './catalog';
import { hourlyRate, laborRate, materialPrice } from './estimator';
import { rate } from './format';
import { FINISH_LABOR_FACTOR, FINISH_LABOR_TRADES, jobType, perUnit } from './jobTypes';
import type { FinishLevel, JobTypeId, PriceBook, WorkItem, WorkSection } from './types';

export interface PlanRequest {
  jobTypeId: JobTypeId;
  /** The contractor's notes, typed or dictated. */
  text: string;
  /** The job's main size in the job type's unit, when the contractor gave it. */
  size?: number;
  finish: FinishLevel;
  /** Sizes measured on site (3D scan, satellite), as a sentence. */
  measured?: string;
  priceBook: PriceBook;
  markupPct: number;
  /** Also write section and item names in Vietnamese (a Vietnamese app or Vietnamese quotes). */
  wantVi: boolean;
}

export interface PlanResult {
  work: WorkSection[];
  /** The main size the AI read from the notes, when the contractor did not type one. */
  size?: number;
  notes: string[];
  /** Answers to the contractor's own questions for this type of work. */
  answers: Record<string, unknown>;
}

/** The AI could not plan the job without a measurement: `message` says what to measure. */
export class NeedSizeError extends Error {}

export const WORK_UNITS = ['SF', 'LF', 'EA', 'SQ', 'CY', 'HR', 'LS'];

/** Upper limits that keep an impossible AI number (50,000 lights) out of the price. */
function maxQty(unit: string): number {
  switch (unit.toUpperCase()) {
    case 'SF': return 100_000;
    case 'LF': case 'FT': return 10_000;
    case 'SQ': return 500;
    case 'CY': return 2000;
    case 'HR': return 2000;
    case 'LS': return 1;
    default: return 500;
  }
}

/** What one unit of a price-book task costs this contractor: their labor plus its materials, at this finish level. */
export function taskUnitCost(assemblyId: string, pb: PriceBook, finish: FinishLevel): number {
  const a = ASSEMBLY_BY_ID[assemblyId];
  if (!a) return 0;
  const labor = laborRate(a.id, pb) * (FINISH_LABOR_TRADES.includes(a.trade) ? FINISH_LABOR_FACTOR[finish] : 1);
  const mat = a.materials.reduce((t, m) => t + m.perUnit * materialPrice(m.materialId, pb, finish), 0);
  return Math.round((labor + mat) * 100) / 100;
}

/** The contractor's price book as the AI reads it: id | task | unit | their cost per unit. */
export function priceBookList(pb: PriceBook, finish: FinishLevel): string {
  return TRADE_ORDER.map((t) => {
    const rows = ASSEMBLIES.filter((a) => a.trade === t).map((a) => {
      const what = a.labor > 0 ? (a.materials.length ? 'labor + materials' : 'labor only') : 'materials only';
      return `${a.id} | ${a.name} | ${a.unit} | $${taskUnitCost(a.id, pb, finish)} (${what})`;
    });
    return rows.length ? `${TRADE_NAMES[t].en}:\n${rows.join('\n')}` : '';
  }).filter(Boolean).join('\n');
}

export const planSystem = (wantVi: boolean) => `You are an experienced Washington State general contractor. Another contractor describes one job: notes that are typed or dictated (informal, any language, often mixed with English) and sometimes site photos.
Write the list of work for THIS job the way you would after walking it yourself: the stages of the job in the order they happen, and under each stage the tasks with their quantities.

Every job is planned on its own. Do not start from a standard package for the type of work. Read what this job is, what is there now and what is changing, and include only the work this job calls for. Two bathrooms are never the same job.

Sections
- 2 to 9 sections, named the way this job's stages would be written on its quote. A bathroom might read "Demo & site cleanup", "Plumbing", "Tile", "Electrical", "Fixtures & finish"; a flooring job "Demo & site cleanup", "Vapor barrier", "LVP install", "Baseboard & transitions". Those two only show the style: write the sections this job really has.
- Titles are short (2 to 5 words), in English. No section or item for overhead, profit, markup, contingency, sales tax or permit fees: the app adds markup and tax, and permit fees are listed as not included.

Items
- For each task, look in the contractor's price book first. When a task there is this work, use it: {"task": its id, "qty": a number in that task's unit}. Its money comes from the contractor's own prices. Never add a second item for labor or materials a price-book task already covers ("labor + materials" tasks include their materials). "materials only" tasks are the fixture or material itself: leave them out when the owner supplies it.
- When nothing in the price book is this work, write the item yourself: {"name", "qty", "unit", "hours", "materials"}. "name" is in English. "hours" is the total labor hours for the whole item, for a small crew that does this work every week (not a homeowner, not a big company with overhead). "materials" is what the materials for the whole item cost the contractor today at a Seattle-Tacoma supplier, in dollars; 0 for labor-only work. No markup in either number.
- "unit" is one of SF, LF, EA, SQ (100 SF of roof), CY, HR, LS (one lump item, qty 1).
- Stay at the level a contractor prices at: usually 4 to 30 items for the whole job. Do not split one task into its steps.
- Every item has "from": "notes" when the contractor's notes say it, "photo" when you took it from a photo, "assumed" when it is your own judgment of what this job needs. The contractor is shown which is which, so be exact.

Quantities
- Quantities come from the size given, the notes and what the photos clearly show, and they must be what this one job really needs. A single bathroom is one haul-away, not three. Protect the site once and clean up once per job. Count each fixture once.
- The contractor's numbers always win.
- Never invent the job's main size or any other measured size. If the main size is not given and cannot be worked out from a dimension in the notes, reply with only {"needSize": "what to measure, in a few words"}.
- You may work a quantity out from a stated size (shower wall tile from the shower's size, baseboard from the room's perimeter): say in "notes" how you got it.
- Before you answer, add the job up roughly from the per-unit costs listed and the hourly cost. If the contractor's own pricing history is given and your list lands far above it, look for double counting and oversized quantities. Never drop work the job needs, or change the contractor's numbers, to reach a figure.

Also reply with
- "size": the job's main quantity in the job type's unit, as given or as stated in the notes.
- "notes": up to 8 short, concrete things a GC would flag from the notes or photos: visible damage (water stains, rot, mold), code issues (no GFCI near water, missing egress, ungrounded outlets), access problems, things to confirm with the owner, likely hidden conditions, and any size you worked out. Empty list if nothing.
- "answers": answers to the contractor's own questions for this type of work, when any are listed and the notes or photos support an answer ({questionId: value}).
Photos — accuracy matters more than finding something:
- Photos are labeled (Photo 1, Photo 2 …). Start every note that comes from a photo with its label, e.g. "Photo 2: water stain on the ceiling below the tub".
- Use only what is clearly visible. If you are not sure, say "Possible …, check on site". Do not describe what is out of frame or hidden.
- Do not read measurements from a photo unless a known-size reference is visible (a standard 80" door, a 4x8 drywall sheet, a 12" tile, a tape measure); then say which reference you used. Counts of clearly visible items are fine.
- If a photo disagrees with the notes, keep the contractor's number and add a note about the difference.
${wantVi ? '\nEvery section and every item you write yourself also gets "vi": the same title or name in Vietnamese, the way a Vietnamese contractor in Washington writes it (trade words such as LVP, GFCI, drywall stay as they are).\n' : ''}
Reply with ONLY a JSON object:
{"size": number, "sections": [{"title": string${wantVi ? ', "vi": string' : ''}, "items": [{"task": string, "qty": number, "from": string} or {"name": string${wantVi ? ', "vi": string' : ''}, "qty": number, "unit": string, "hours": number, "materials": number, "from": string}]}], "notes": [string], "answers": {}}`;

/** What the AI is told about the job. */
export function planUserText(req: PlanRequest, photoLine: string): string {
  const jt = jobType(req.jobTypeId);
  const custom = jt.questions.filter((q) => q.custom).map((q) => ({ id: q.id, label: q.label, kind: q.kind, unit: q.unit, options: q.options?.map((o) => o.value) }));
  const per = jt.unit === 'JOB' ? 'one price per job, no main size needed' : `priced${perUnit(jt.unit)}`;
  return [
    `Type of work: ${jt.name} (${per})`,
    jt.unit === 'JOB' ? '' : `Size: ${req.size && req.size > 0 ? `${req.size} ${jt.unit === 'EA' ? 'items' : jt.unit}` : 'not typed in: read it from the notes'}`,
    `Finish level: ${req.finish === 'basic' ? 'basic (builder grade)' : req.finish === 'high' ? 'high-end' : 'mid-grade'}`,
    req.measured?.trim() ? `Measured on site: ${req.measured.trim()}` : '',
    `Contractor's labor cost: ${rate(hourlyRate(req.priceBook))} per hour. Their markup, added by the app: ${req.markupPct}%.`,
    `Price book: tasks this contractor already has prices for (id | task | unit | their cost per unit):\n${priceBookList(req.priceBook, req.finish)}`,
    custom.length ? `The contractor's own questions for this type of work:\n${JSON.stringify(custom)}` : '',
    `${photoLine}Contractor notes:\n${req.text.trim() || '(no notes: use the photos, the type of work and the size)'}`,
  ].filter(Boolean).join('\n\n');
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const number = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[,$]/g, '')) : NaN);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The AI's reply as a work list the app can price. Never trusts the model: unknown tasks, impossible quantities and
 * empty items are dropped, the same price-book task twice becomes one line, and sections with nothing left go.
 * Throws NeedSizeError when the AI asked for a measurement instead of planning.
 */
export function cleanPlan(raw: unknown): { work: WorkSection[]; size?: number; notes: string[]; answers: Record<string, unknown> } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const need = text(r.needSize, 200);
  const sectionsRaw = Array.isArray(r.sections) ? r.sections : [];
  if (need && sectionsRaw.length === 0) throw new NeedSizeError(need);

  const seenTask = new Map<string, WorkItem>();
  let n = 0;
  const work: WorkSection[] = [];
  for (const sr of sectionsRaw.slice(0, 12)) {
    if (!sr || typeof sr !== 'object') continue;
    const s = sr as Record<string, unknown>;
    const title = text(s.title, 60);
    if (!title) continue;
    const items: WorkItem[] = [];
    for (const ir of (Array.isArray(s.items) ? s.items : []).slice(0, 40)) {
      if (!ir || typeof ir !== 'object' || n >= 80) continue;
      const i = ir as Record<string, unknown>;
      const from = i.from === 'notes' || i.from === 'photo' ? i.from : 'assumed';
      const task = typeof i.task === 'string' ? i.task.trim() : '';
      const qtyRaw = number(i.qty);
      if (task) {
        const a = ASSEMBLY_BY_ID[task];
        if (!a || !(qtyRaw > 0)) continue;
        const qty = Math.min(round2(qtyRaw), maxQty(a.unit));
        const had = seenTask.get(a.id);
        if (had) { had.qty = Math.min(round2(had.qty + qty), maxQty(a.unit)); continue; }
        const item: WorkItem = { id: `i${++n}`, assemblyId: a.id, name: a.name, vi: a.vi, qty, unit: a.unit, from };
        seenTask.set(a.id, item);
        items.push(item);
        continue;
      }
      const name = text(i.name, 80);
      if (!name) continue;
      const u = text(i.unit, 6).toUpperCase();
      const unit = WORK_UNITS.includes(u) ? u : 'EA';
      const qty = unit === 'LS' ? 1 : Math.min(round2(qtyRaw > 0 ? qtyRaw : 1), maxQty(unit));
      const hours = Math.min(2000, Math.max(0, round2(number(i.hours) || 0)));
      const materials = Math.min(250_000, Math.max(0, Math.round(number(i.materials) || 0)));
      if (!(hours > 0) && !(materials > 0)) continue;
      items.push({ id: `i${++n}`, name, vi: text(i.vi, 100) || name, qty, unit, hours, materials, from });
    }
    if (items.length) work.push({ key: `s${work.length + 1}`, title, vi: text(s.vi, 80) || title, items });
  }
  const size = number(r.size);
  const notes = Array.isArray(r.notes) ? r.notes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 240)).slice(0, 10) : [];
  const answers = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
  return { work, ...(size > 0 && size <= 100_000 ? { size: round2(size) } : {}), notes, answers };
}

/** A key for a section added by hand that no section of this job has used. */
export function nextSectionKey(work: WorkSection[]): string {
  let k = work.length + 1;
  while (work.some((s) => s.key === `s${k}`)) k++;
  return `s${k}`;
}

/** Keeps a saved work list to the shape the screens and the pricing expect (cloud copies, older versions). */
export function sanitizeWork(v: unknown): WorkSection[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: WorkSection[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const sr of v.slice(0, 30)) {
    if (!sr || typeof sr !== 'object') continue;
    const s = sr as Record<string, unknown>;
    const key = typeof s.key === 'string' && s.key && !keys.has(s.key) ? s.key.slice(0, 20) : '';
    if (!key) continue;
    keys.add(key);
    const items: WorkItem[] = [];
    for (const ir of (Array.isArray(s.items) ? s.items : []).slice(0, 80)) {
      if (!ir || typeof ir !== 'object') continue;
      const i = ir as Record<string, unknown>;
      const id = typeof i.id === 'string' && i.id && !ids.has(i.id) ? i.id.slice(0, 40) : '';
      const qty = number(i.qty);
      if (!id || !Number.isFinite(qty) || qty < 0) continue;
      ids.add(id);
      const assemblyId = typeof i.assemblyId === 'string' && ASSEMBLY_BY_ID[i.assemblyId] ? i.assemblyId : undefined;
      const name = text(i.name, 80) || (assemblyId ? ASSEMBLY_BY_ID[assemblyId].name : '');
      if (!name) continue;
      const from = i.from === 'notes' || i.from === 'photo' || i.from === 'assumed' || i.from === 'you' ? i.from : undefined;
      items.push({
        id, ...(assemblyId ? { assemblyId } : {}), name, vi: text(i.vi, 100) || name, qty: round2(qty), unit: text(i.unit, 6) || 'EA',
        ...(assemblyId ? (Number.isFinite(number(i.labor)) && number(i.labor) >= 0 ? { labor: round2(number(i.labor)) } : {})
          : { hours: Math.max(0, round2(number(i.hours) || 0)), materials: Math.max(0, round2(number(i.materials) || 0)) }),
        ...(from ? { from } : {}),
      });
    }
    out.push({ key, title: text(s.title, 60) || 'Work', vi: text(s.vi, 80) || text(s.title, 60) || 'Work', items });
  }
  return out;
}
