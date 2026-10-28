import { ASSEMBLY_BY_ID, MATERIAL_BY_ID, TRADE_ORDER } from './catalog';
import { runChecks } from './checks';
import { FINISH_FACTOR, FINISH_LABOR_FACTOR, FINISH_LABOR_TRADES, JOB_TYPE_BY_ID, num } from './jobTypes';
import type {
  Answers, EstimateLine, FinishLevel, JobTypeId, MaterialLine, PastJob, Presets, PriceBook,
  PriceComparison, ScopeItem, Trade, TradeTotal,
} from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EstimateInput {
  jobTypeId: JobTypeId;
  mode: 'quick' | 'detailed';
  finish: FinishLevel;
  answers: Answers;
  customItems: ScopeItem[];
  markupPct: number;
  minMarkupPct: number;
  salesTaxPct: number;
  priceBook: PriceBook;
  presets: Presets;
  pastJobs: PastJob[];
}

export function laborRate(assemblyId: string, pb: PriceBook): number {
  const o = pb.labor[assemblyId];
  return typeof o === 'number' ? o : ASSEMBLY_BY_ID[assemblyId]?.labor ?? 0;
}

export function materialPrice(materialId: string, pb: PriceBook, finish: FinishLevel): number {
  const mat = MATERIAL_BY_ID[materialId];
  if (!mat) return 0;
  const o = pb.materials[materialId];
  const base = typeof o === 'number' ? o : mat.price;
  return mat.finishSensitive ? base * FINISH_FACTOR[finish] : base;
}

export function presetFor(jobTypeId: JobTypeId, finish: FinishLevel, presets: Presets): number {
  return presets[jobTypeId]?.[finish] ?? JOB_TYPE_BY_ID[jobTypeId].defaultPreset[finish];
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

export function comparePrice(
  jobTypeId: JobTypeId, finish: FinishLevel, sizeSf: number, price: number, presets: Presets, pastJobs: PastJob[],
): PriceComparison {
  const preset = JOB_TYPE_BY_ID[jobTypeId].defaultPreset.mid > 0 ? presetFor(jobTypeId, finish, presets) : 0;
  const hist = historyPerSf(jobTypeId, finish, pastJobs);
  const presetPerSf = preset > 0 ? preset : null;
  if (!(sizeSf > 0) || !(price > 0)) {
    return { sizeSf, pricePerSf: 0, presetPerSf, historyPerSf: hist.perSf, historyCount: hist.count, flag: 'none',
      message: 'Add the project size to compare with how you normally charge.' };
  }
  const pricePerSf = round2(price / sizeSf);
  const ref = hist.perSf ?? presetPerSf;
  if (!ref) {
    return { sizeSf, pricePerSf, presetPerSf, historyPerSf: null, historyCount: 0, flag: 'none',
      message: 'Set a $/SF preset or add past jobs to compare.' };
  }
  const refLabel = hist.perSf
    ? `your average from ${hist.count} past job${hist.count === 1 ? '' : 's'}`
    : 'your preset';
  const diff = (pricePerSf - ref) / ref;
  const pct = Math.round(Math.abs(diff) * 100);
  let flag: PriceComparison['flag'] = 'ok';
  let message = `In line with ${refLabel} ($${ref.toFixed(0)}/SF).`;
  if (diff > 0.2) { flag = 'high'; message = `${pct}% above ${refLabel} ($${ref.toFixed(0)}/SF). Check scope or quantities.`; }
  if (diff < -0.2) { flag = 'low'; message = `${pct}% below ${refLabel} ($${ref.toFixed(0)}/SF). Make sure nothing is missing.`; }
  return { sizeSf, pricePerSf, presetPerSf, historyPerSf: hist.perSf, historyCount: hist.count, flag, message };
}

export interface EstimateResult {
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
  const jt = JOB_TYPE_BY_ID[input.jobTypeId];
  const pb = input.priceBook;
  const sizeSf = num(input.answers, 'sizeSf');
  const markupRate = Math.max(0, input.markupPct) / 100;

  // ---- Quick mode: size x $/SF ----
  if (input.mode === 'quick' || !jt.detailed) {
    const perSf = presetFor(input.jobTypeId, input.finish, input.presets);
    const price = round2(sizeSf * perSf);
    const cost = round2(price / (1 + markupRate));
    const markup = round2(price - cost);
    const tax = round2(price * input.salesTaxPct / 100);
    const comparison = comparePrice(input.jobTypeId, input.finish, sizeSf, price, input.presets, input.pastJobs);
    return {
      lines: [], materials: [],
      trades: [{ trade: 'general', labor: 0, materials: 0, cost, price }],
      laborTotal: 0, materialTotal: 0, cost, markup, price, tax, total: round2(price + tax),
      checks: runChecks({ ...input, scope: [] }),
      comparison,
    };
  }

  // ---- Detailed mode: assemblies ----
  const scope = mergeScope([...jt.scope(input.answers), ...input.customItems]);

  // Raw material quantities per line, then total purchase quantities rounded up.
  const rawByMaterial = new Map<string, number>();
  const linesRaw = scope.map((it) => {
    const a = ASSEMBLY_BY_ID[it.assemblyId];
    const lu = round2(laborRate(a.id, pb) * (FINISH_LABOR_TRADES.includes(a.trade) ? FINISH_LABOR_FACTOR[input.finish] : 1));
    let rawMat = 0;
    for (const am of a.materials) {
      const q = am.perUnit * it.qty;
      rawByMaterial.set(am.materialId, (rawByMaterial.get(am.materialId) ?? 0) + q);
      rawMat += q * materialPrice(am.materialId, pb, input.finish);
    }
    return { a, qty: it.qty, laborUnit: lu, labor: round2(lu * it.qty), rawMat };
  });

  const materials: MaterialLine[] = [...rawByMaterial.entries()].map(([id, rawQty]) => {
    const mat = MATERIAL_BY_ID[id];
    const qty = Math.max(1, Math.ceil(rawQty - 1e-6));
    const unitPrice = round2(materialPrice(id, pb, input.finish));
    return { materialId: id, name: mat.name, category: mat.category, rawQty: round2(rawQty), qty, unit: mat.unit, unitPrice, total: round2(qty * unitPrice) };
  }).sort((x, y) => x.category.localeCompare(y.category) || x.name.localeCompare(y.name));

  const materialTotal = round2(materials.reduce((t, x) => t + x.total, 0));
  const rawMatTotal = linesRaw.reduce((t, l) => t + l.rawMat, 0);
  // Spread purchase rounding (buying whole boxes/sheets) across lines in proportion to their raw use.
  const factor = rawMatTotal > 0 ? materialTotal / rawMatTotal : 0;

  const lines: EstimateLine[] = linesRaw.map((l) => ({
    assemblyId: l.a.id, name: l.a.name, vi: l.a.vi, trade: l.a.trade, qty: round2(l.qty), unit: l.a.unit,
    laborUnit: l.laborUnit, labor: l.labor, materials: round2(l.rawMat * factor),
  }));

  const tradeMap = new Map<Trade, TradeTotal>();
  for (const l of lines) {
    const t = tradeMap.get(l.trade) ?? { trade: l.trade, labor: 0, materials: 0, cost: 0, price: 0 };
    t.labor += l.labor;
    t.materials += l.materials;
    tradeMap.set(l.trade, t);
  }
  const trades = TRADE_ORDER.filter((t) => tradeMap.has(t)).map((t) => {
    const x = tradeMap.get(t)!;
    const cost = round2(x.labor + x.materials);
    return { trade: t, labor: round2(x.labor), materials: round2(x.materials), cost, price: round2(cost * (1 + markupRate)) };
  });

  const laborTotal = round2(lines.reduce((t, l) => t + l.labor, 0));
  const cost = round2(laborTotal + materialTotal);
  const price = round2(trades.reduce((t, x) => t + x.price, 0));
  const markup = round2(price - cost);
  const tax = round2(price * input.salesTaxPct / 100);

  return {
    lines, materials, trades, laborTotal, materialTotal, cost, markup, price, tax, total: round2(price + tax),
    checks: runChecks({ ...input, scope }),
    comparison: comparePrice(input.jobTypeId, input.finish, sizeSf, price, input.presets, input.pastJobs),
  };
}
