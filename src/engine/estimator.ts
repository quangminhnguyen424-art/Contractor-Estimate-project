import { reapplySectionPrices } from './sectionPrice';
import { rate } from './format';
import { ASSEMBLY_BY_ID, DEFAULT_HOURLY, MATERIAL_BY_ID, TRADE_ORDER } from './catalog';
import { runChecks } from './checks';
import { FINISH_FACTOR, FINISH_LABOR_FACTOR, FINISH_LABOR_TRADES, jobType, mainQuantity, num, perUnit, yes } from './jobTypes';
import type {
  Estimate,
  Answers, EstimateLine, ExtraLine, FinishLevel, JobType, JobTypeId, MaterialLine, PastJob, PriceUnit, Presets, PriceBook,
  PriceComparison, ScopeItem, TradeTotal, WorkItem, WorkSection,
} from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EstimateInput {
  jobTypeId: JobTypeId;
  mode: 'quick' | 'detailed';
  finish: FinishLevel;
  answers: Answers;
  customItems: ScopeItem[];
  /** The work planned for this job. When set, it is what gets priced (not the job type's fixed questions). */
  work?: WorkSection[];
  markupPct: number;
  minMarkupPct: number;
  salesTaxPct: number;
  priceBook: PriceBook;
  presets: Presets;
  pastJobs: PastJob[];
}

export function laborRate(assemblyId: string, pb: PriceBook): number {
  const o = pb.labor[assemblyId];
  return typeof o === 'number' && Number.isFinite(o) && o >= 0 ? o : ASSEMBLY_BY_ID[assemblyId]?.labor ?? 0;
}

export function materialPrice(materialId: string, pb: PriceBook, finish: FinishLevel): number {
  const mat = MATERIAL_BY_ID[materialId];
  if (!mat) return 0;
  const o = pb.materials[materialId];
  const base = typeof o === 'number' && Number.isFinite(o) && o >= 0 ? o : mat.price;
  return mat.finishSensitive ? base * FINISH_FACTOR[finish] : base;
}

export function presetFor(jobTypeId: JobTypeId, finish: FinishLevel, presets: Presets): number {
  const v = presets[jobTypeId]?.[finish];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : jobType(jobTypeId).defaultPreset[finish];
}

/**
 * Lines from the contractor's own priced questions: a number answer × their price per unit,
 * or their price when a yes/no answer is yes. Client prices, whole dollars.
 */
export function extraLines(jt: JobType, a: Answers): ExtraLine[] {
  const out: ExtraLine[] = [];
  for (const q of jt.questions) {
    if (!q.custom || !(typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0)) continue;
    const qty = q.kind === 'number' ? num(a, q.id) : q.kind === 'yesno' ? (yes(a, q.id) ? 1 : 0) : 0;
    if (!(qty > 0)) continue;
    out.push({ questionId: q.id, label: q.label, qty: round2(qty), unit: q.kind === 'number' ? q.unit ?? '' : '', unitPrice: q.price,
      price: Math.round(qty * q.price) });
  }
  return out;
}

/** Merge duplicate scope items so the same assembly appears once. */
function mergeScope(items: ScopeItem[]): ScopeItem[] {
  const map = new Map<string, number>();
  for (const it of items) {
    if (!ASSEMBLY_BY_ID[it.assemblyId] || !(it.qty > 0)) continue;
    map.set(it.assemblyId, (map.get(it.assemblyId) ?? 0) + it.qty);
  }
  return [...map.entries()].map(([assemblyId, qty]) => ({ assemblyId, qty }));
}

/** Average price per SF from the contractor's own past jobs of this type. */
export function historyPerSf(jobTypeId: JobTypeId, finish: FinishLevel, pastJobs: PastJob[]) {
  const same = pastJobs.filter((j) => j.jobTypeId === jobTypeId && j.sizeSf > 0 && j.price > 0);
  const exact = same.filter((j) => j.finish === finish);
  const use = exact.length > 0 ? exact : same;
  if (use.length === 0) return { perSf: null as number | null, count: 0, exactFinish: false };
  const perSf = use.reduce((t, j) => t + j.price / j.sizeSf, 0) / use.length;
  return { perSf: round2(perSf), count: use.length, exactFinish: exact.length > 0 };
}

/** The comparison message for a price that is `diff` (fraction) away from the reference. */
export function compareMessage(diff: number, ref: number, refLabel: string, unit: PriceUnit | undefined) {
  const pct = Math.round(Math.abs(diff) * 100);
  const per = `${rate(ref)}${perUnit(unit)}`;
  if (diff > 0.2) return { flag: 'high' as const, message: `${pct}% above ${refLabel} (${per}). Check scope or quantities.` };
  if (diff < -0.2) return { flag: 'low' as const, message: `${pct}% below ${refLabel} (${per}). Make sure nothing is missing.` };
  return { flag: 'ok' as const, message: `In line with ${refLabel} (${per}).` };
}

/** Compares the main price (without the contractor's priced extras) with their preset and past jobs, per unit. */
export function comparePrice(
  jobTypeId: JobTypeId, finish: FinishLevel, sizeSf: number, price: number, presets: Presets, pastJobs: PastJob[],
): PriceComparison {
  const jt = jobType(jobTypeId);
  const unit = jt.unit;
  if (jobTypeId === 'small') {
    return { unit, sizeSf, pricePerSf: 0, presetPerSf: null, historyPerSf: null, historyCount: 0, flag: 'none',
      message: 'Small jobs are priced item by item from your price book.' };
  }
  const preset = presetFor(jobTypeId, finish, presets);
  const hist = historyPerSf(jobTypeId, finish, pastJobs);
  const presetPerSf = preset > 0 ? preset : null;
  if (!(sizeSf > 0) || !(price > 0)) {
    return { unit, sizeSf, pricePerSf: 0, presetPerSf, historyPerSf: hist.perSf, historyCount: hist.count, flag: 'none',
      message: !(sizeSf > 0) ? `Add the ${unit === 'EA' ? 'number of items' : unit === 'LF' ? 'length' : 'size'} to compare with how you normally charge.`
        : `No price yet. Set your price${perUnit(unit)} for this job type in Pricing.` };
  }
  const pricePerSf = round2(price / sizeSf);
  const ref = hist.perSf ?? presetPerSf;
  if (!ref) {
    return { unit, sizeSf, pricePerSf, presetPerSf, historyPerSf: null, historyCount: 0, flag: 'none',
      message: `Set your price${perUnit(unit)} in Pricing or add past jobs to compare.` };
  }
  const refLabel = hist.perSf
    ? `your average from ${hist.count} past job${hist.count === 1 ? '' : 's'}`
    : 'your preset';
  const { flag, message } = compareMessage((pricePerSf - ref) / ref, ref, refLabel, unit);
  return { unit, sizeSf, pricePerSf, presetPerSf, historyPerSf: hist.perSf, historyCount: hist.count, flag, message };
}

export interface EstimateResult {
  extras: ExtraLine[];
  lines: EstimateLine[];
  materials: MaterialLine[];
  trades: TradeTotal[];
  laborTotal: number;
  materialTotal: number;
  cost: number;
  markup: number;
  price: number;
  tax: number;
  total: number;
  checks: ReturnType<typeof runChecks>;
  comparison: PriceComparison;
}

export function buildEstimate(input: EstimateInput): EstimateResult {
  const jt = jobType(input.jobTypeId);
  const sizeSf = mainQuantity(jt, input.answers);
  const markupRate = Math.max(0, input.markupPct) / 100;
  const extras = extraLines(jt, input.answers);
  const extrasTotal = extras.reduce((t, x) => t + x.price, 0);

  // ---- A job Studwise planned: its own sections and items ----
  if (input.work) {
    const work = pricedWork(input.work);
    const entries: Entry[] = work.flatMap((sec) => sec.items.map((i) => (i.assemblyId
      ? { section: sec.key, assemblyId: i.assemblyId, qty: i.qty, labor: i.labor } : { section: sec.key, qty: i.qty, own: i })));
    const scope = mergeScope(entries.filter((e) => e.assemblyId).map((e) => ({ assemblyId: e.assemblyId!, qty: e.qty })));
    return priceWork(input, entries, work, scope, extras, sizeSf);
  }

  // ---- Quick mode: quantity x price per unit, plus the contractor's priced extras ----
  // Small jobs are always itemized; a single price per job makes no sense for them.
  if ((input.mode === 'quick' && input.jobTypeId !== 'small') || !jt.detailed) {
    // Quick mode: the preset IS the client price. Markup doesn't change it (cost is shown as an estimate only).
    const perSf = presetFor(input.jobTypeId, input.finish, input.presets);
    // A per-job price can be for several of the same (3 panels): Quick price saves how many in `jobCount`.
    const qty = jt.unit === 'JOB' ? Math.min(999, Math.max(1, Math.round(Number(input.answers.jobCount) || 1))) : sizeSf;
    const mainPrice = Math.round(qty * perSf);
    const price = mainPrice + extrasTotal;
    const cost = round2(price / (1 + markupRate));
    const markup = round2(price - cost);
    const tax = round2(price * input.salesTaxPct / 100);
    const comparison = comparePrice(input.jobTypeId, input.finish, qty, mainPrice, input.presets, input.pastJobs);
    return {
      extras, lines: [], materials: [],
      trades: [{ trade: 'general', labor: 0, materials: 0, cost, price }],
      laborTotal: 0, materialTotal: 0, cost, markup, price, tax, total: round2(price + tax),
      checks: [
        ...(perSf > 0 ? [] : [{ id: 'noprice', level: 'warn' as const, title: `Your price${perUnit(jt.unit)} for ${jt.name} is not set`,
          detail: 'Set it on the questions screen or in Pricing. It is saved for every job of this type.' }]),
        ...runChecks({ ...input, mode: 'quick', scope: [] }),
      ],
      comparison,
    };
  }

  // ---- Detailed mode: assemblies ----
  const scope = mergeScope([...jt.scope(input.answers), ...input.customItems]);
  return priceWork(input, scope.map((it) => ({ section: ASSEMBLY_BY_ID[it.assemblyId].trade, assemblyId: it.assemblyId, qty: it.qty })), null, scope, extras, sizeSf);
}

/** The contractor's labor cost per hour, for work that is not in the price book. */
export function hourlyRate(pb: PriceBook): number {
  const h = pb.hourly;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : DEFAULT_HOURLY;
}

/** A planned job's items that can be priced: a known price-book task, or work with a name; and more than none of it. */
export function pricedWork(work: WorkSection[]): WorkSection[] {
  return work.map((s) => ({ ...s, items: s.items.filter((i) => i.qty > 0 && (i.assemblyId ? !!ASSEMBLY_BY_ID[i.assemblyId] : !!i.name.trim())) }))
    .filter((s) => s.items.length > 0);
}

interface Entry { section: string; assemblyId?: string; qty: number; own?: WorkItem; labor?: number }

/** Prices a list of work: price-book tasks from the price book, the job's own items from hours and their materials. */
function priceWork(
  input: EstimateInput, entries: Entry[], sections: WorkSection[] | null, scope: ScopeItem[], extras: ExtraLine[], sizeSf: number,
): EstimateResult {
  const pb = input.priceBook;
  const markupRate = Math.max(0, input.markupPct) / 100;
  const extrasTotal = extras.reduce((t, x) => t + x.price, 0);
  const hourly = hourlyRate(pb);

  // Raw material quantities per line, then total purchase quantities rounded up.
  const rawByMaterial = new Map<string, number>();
  const ownMaterials: MaterialLine[] = [];
  const linesRaw = entries.map((it) => {
    if (it.own) {
      const hours = Math.max(0, it.own.hours ?? 0);
      const labor = round2(hours * hourly);
      const mat = round2(Math.max(0, it.own.materials ?? 0));
      if (mat > 0) {
        ownMaterials.push({ materialId: `w:${it.own.id}`, name: it.own.name, category: 'Other materials', rawQty: 1, qty: 1, unit: 'lot', unitPrice: mat, total: mat });
      }
      return { id: `w:${it.own.id}`, name: it.own.name, vi: it.own.vi || it.own.name, unit: it.own.unit, section: it.section, qty: it.qty,
        laborUnit: it.qty > 0 ? round2(labor / it.qty) : 0, labor, rawMat: 0, ownMat: mat, hours };
    }
    const a = ASSEMBLY_BY_ID[it.assemblyId!];
    // A labor cost the contractor set on this job stands as typed; otherwise their price book, by finish level.
    const lu = typeof it.labor === 'number' && Number.isFinite(it.labor) && it.labor >= 0 ? round2(it.labor)
      : round2(laborRate(a.id, pb) * (FINISH_LABOR_TRADES.includes(a.trade) ? FINISH_LABOR_FACTOR[input.finish] : 1));
    let rawMat = 0;
    for (const am of a.materials) {
      const q = am.perUnit * it.qty;
      rawByMaterial.set(am.materialId, (rawByMaterial.get(am.materialId) ?? 0) + q);
      rawMat += q * materialPrice(am.materialId, pb, input.finish);
    }
    return { id: a.id, name: a.name, vi: a.vi, unit: a.unit, section: it.section, qty: it.qty, laborUnit: lu, labor: round2(lu * it.qty), rawMat, ownMat: 0, hours: undefined as number | undefined };
  });

  const bookMaterials: MaterialLine[] = [...rawByMaterial.entries()].map(([id, rawQty]) => {
    const mat = MATERIAL_BY_ID[id];
    const qty = Math.max(1, Math.ceil(rawQty - 1e-6));
    const unitPrice = round2(materialPrice(id, pb, input.finish));
    return { materialId: id, name: mat.name, category: mat.category, rawQty: round2(rawQty), qty, unit: mat.unit, unitPrice, total: round2(qty * unitPrice) };
  });
  const materials = [...bookMaterials, ...ownMaterials].sort((x, y) => x.category.localeCompare(y.category) || x.name.localeCompare(y.name));

  const bookTotal = round2(bookMaterials.reduce((t, x) => t + x.total, 0));
  const materialTotal = round2(materials.reduce((t, x) => t + x.total, 0));
  const rawMatTotal = linesRaw.reduce((t, l) => t + l.rawMat, 0);
  // Spread purchase rounding (buying whole boxes/sheets) across lines in proportion to their raw use.
  const factor = rawMatTotal > 0 ? bookTotal / rawMatTotal : 0;

  const lines: EstimateLine[] = linesRaw.map((l) => ({
    assemblyId: l.id, name: l.name, vi: l.vi, trade: l.section, qty: round2(l.qty), unit: l.unit,
    laborUnit: l.laborUnit, labor: l.labor, materials: round2(l.rawMat * factor + l.ownMat),
    ...(l.hours != null ? { hours: round2(l.hours) } : {}),
  }));

  const tradeMap = new Map<string, TradeTotal>();
  for (const l of lines) {
    const t = tradeMap.get(l.trade) ?? { trade: l.trade, labor: 0, materials: 0, cost: 0, price: 0 };
    t.labor += l.labor;
    t.materials += l.materials;
    tradeMap.set(l.trade, t);
  }
  // A planned job keeps its own sections in its own order; the others follow the usual order of the trades.
  const order: { key: string; title?: string; vi?: string }[] = sections
    ? sections.map((x) => ({ key: x.key, title: x.title, vi: x.vi || x.title }))
    : TRADE_ORDER.map((t) => ({ key: t as string }));
  const trades = order.filter((o) => tradeMap.has(o.key)).map((o) => {
    const x = tradeMap.get(o.key)!;
    const cost = round2(x.labor + x.materials);
    // Client-facing amounts are whole dollars so every section adds up exactly to the quote total.
    return { trade: o.key, ...(o.title ? { title: o.title, vi: o.vi } : {}), labor: round2(x.labor), materials: round2(x.materials), cost, price: Math.round(cost * (1 + markupRate)) };
  });

  const laborTotal = round2(lines.reduce((t, l) => t + l.labor, 0));
  const tradesPrice = trades.reduce((t, x) => t + x.price, 0);
  // Priced extras are what the contractor charges; their cost share assumes the same markup.
  const cost = round2(laborTotal + materialTotal + extrasTotal / (1 + markupRate));
  const price = tradesPrice + extrasTotal;
  const markup = round2(price - cost);
  const tax = round2(price * input.salesTaxPct / 100);

  const checks = runChecks({ ...input, mode: 'detailed', scope, planned: !!sections });
  if (sections) {
    const own = entries.filter((e) => e.own);
    const judged = sections.flatMap((x) => x.items).filter((i) => i.from === 'assumed' || i.from === 'photo').length;
    if (own.length) {
      checks.push({ id: 'own-items', level: 'info', title: `Items not in your price book: ${own.length}`,
        detail: `Priced from the hours shown at your labor cost of ${rate(hourly)} per hour, plus the materials shown. Change either on the work list, or the hourly cost in your price book.` });
    }
    if (judged) {
      checks.push({ id: 'judged', level: 'info', title: `Items from Studwise’s reading of the job: ${judged}`,
        detail: 'They are marked on the work list. Check them against what you saw on site before sending.' });
    }
  }

  return {
    extras, lines, materials, trades, laborTotal, materialTotal, cost, markup, price, tax, total: round2(price + tax),
    checks,
    comparison: comparePrice(input.jobTypeId, input.finish, sizeSf, tradesPrice, input.presets, input.pastJobs),
  };
}

/**
 * Change only the markup on an existing estimate, keeping its saved costs, tax rate and quantities.
 * (Rebuilding would silently pull in today's price book and tax rate.)
 */
export function applyMarkup<T extends EstimateResult & { mode: 'quick' | 'detailed'; salesTaxPct: number; markupPct: number; priceEdits?: Estimate['priceEdits']; jobTypeId: Estimate['jobTypeId'] }>(
  est: T, markupPct: number, minMarkupPct: number,
): T {
  if (est.mode === 'quick') return est; // Quick price comes from $/SF, not markup.
  const rate = Math.max(0, markupPct) / 100;
  const trades = est.trades.map((t) => ({ ...t, price: Math.round(t.cost * (1 + rate)) }));
  const extrasTotal = (est.extras ?? []).reduce((t, x) => t + x.price, 0);
  const tradesPrice = trades.reduce((t, x) => t + x.price, 0);
  const price = tradesPrice + extrasTotal;
  const tax = round2(price * est.salesTaxPct / 100);
  const checks = est.checks.filter((c) => c.id !== 'margin');
  if (markupPct < minMarkupPct) {
    checks.unshift({ id: 'margin', level: 'warn', title: `Markup ${markupPct}% is below your ${minMarkupPct}% minimum`,
      detail: 'Raise the markup or confirm this job is worth doing at a lower margin.' });
  }
  const sizeSf = est.comparison.sizeSf;
  const pricePerSf = sizeSf > 0 ? round2(tradesPrice / sizeSf) : 0;
  const ref = est.comparison.historyPerSf ?? est.comparison.presetPerSf;
  let comparison = { ...est.comparison, pricePerSf };
  if (ref && pricePerSf > 0) {
    const refLabel = est.comparison.historyPerSf ? `your average from ${est.comparison.historyCount} past job${est.comparison.historyCount === 1 ? '' : 's'}` : 'your preset';
    comparison = { ...comparison, ...compareMessage((pricePerSf - ref) / ref, ref, refLabel, est.comparison.unit) };
  }
  // Section prices the contractor set by hand on the quote stay set; the rest follow the new markup.
  return reapplySectionPrices({ ...est, markupPct, trades, price, markup: round2(price - est.cost), tax, total: round2(price + tax), checks, comparison }, est.priceEdits);
}
