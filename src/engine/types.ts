// Core data types for the estimating engine.
// The engine is plain TypeScript (no React) so it can be unit-tested and reused on a server.

export type Lang = 'en' | 'vi';

export type Trade =
  | 'demo'
  | 'framing'
  | 'drywall'
  | 'plumbing'
  | 'electrical'
  | 'ventilation'
  | 'tile'
  | 'cabinets'
  | 'carpentry'
  | 'painting'
  | 'fixtures'
  | 'general';

export type FinishLevel = 'basic' | 'mid' | 'high';

/** Built-in ids ('bathroom', 'roofing', …) or a contractor's own type ('ct_…'). */
export type JobTypeId = string;

/** How a job type is priced: per square foot, per linear foot, per item, or one price per job. */
export type PriceUnit = 'SF' | 'LF' | 'EA' | 'JOB';

export type JobCategory = 'Remodel' | 'Exterior' | 'Systems & trades' | 'New construction' | 'Your own work';

export type MaterialCategory =
  | 'Lumber & framing'
  | 'Drywall'
  | 'Plumbing'
  | 'Electrical'
  | 'Ventilation'
  | 'Tile & flooring'
  | 'Cabinets & counters'
  | 'Doors & trim'
  | 'Paint'
  | 'Fixtures'
  | 'Site & disposal';

export interface Material {
  id: string;
  name: string;
  unit: string; // purchase unit: ea, box, roll, sheet, ft, SF, LF, bag ...
  price: number; // default unit price (USD, pre-tax)
  category: MaterialCategory;
  /** true when the price depends on finish level (tile, fixtures, cabinets...) */
  finishSensitive?: boolean;
}

export interface AssemblyMaterial {
  materialId: string;
  perUnit: number; // material purchase units per 1 assembly unit
}

/** A unit of work: labor per unit + the materials it consumes. */
export interface Assembly {
  id: string;
  name: string;
  vi: string;
  trade: Trade;
  unit: string; // LF, SF, EA ...
  labor: number; // contractor labor cost per unit (USD)
  materials: AssemblyMaterial[];
}

export type AnswerValue = number | string | boolean;
export type Answers = Record<string, AnswerValue>;

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  label: string;
  help?: string;
  kind: 'number' | 'choice' | 'yesno' | 'text';
  unit?: string;
  options?: ChoiceOption[];
  default: AnswerValue;
  group?: string;
  /** Contractor-added question (saved in their settings, asked on every job of this type). */
  custom?: boolean;
  /** Custom questions only: what the contractor charges per unit (number) or if yes (yes/no). Client price, pre-tax. */
  price?: number;
}

/** A contractor's own type of work, typed into the blank field. Its prices live in Presets like any other type. */
export interface CustomJobType {
  id: string; // 'ct_…'
  name: string;
  unit: PriceUnit;
}

/** A priced answer to a contractor's own question, e.g. "Haul-away" or "Extra outlets × 3". */
export interface ExtraLine {
  questionId: string;
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  price: number; // client price, whole dollars
}

export interface ScopeItem {
  assemblyId: string;
  qty: number;
}

export interface JobType {
  id: JobTypeId;
  name: string;
  vi: string;
  /** false = Quick (price per unit) only for now */
  detailed: boolean;
  /** What the quick price is per. The main quantity is always stored in answers.sizeSf. */
  unit: PriceUnit;
  category: JobCategory;
  custom?: boolean;
  questions: Question[];
  scope: (a: Answers) => ScopeItem[];
  exclusions: string[];
  exclusionsVi: string[];
  /** Default $/SF presets by finish level, used until the contractor sets their own */
  defaultPreset: Record<FinishLevel, number>;
}

export type Presets = Partial<Record<JobTypeId, Record<FinishLevel, number>>>;

export interface PriceBook {
  labor: Record<string, number>; // assemblyId -> labor per unit override
  materials: Record<string, number>; // materialId -> price override
}

export interface PaymentMilestone {
  label: string;
  pct: number; // 0-100
}

export interface Profile {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  license: string;
  specialties: JobTypeId[];
  markupPct: number; // default markup on cost, %
  minMarkupPct: number; // margin protection floor, %
  salesTaxPct: number; // added to client total, %
  quoteValidDays: number;
  quoteLanguage: Lang;
  schedule: PaymentMilestone[];
  /** In the contractor's words: how they work, what they include, their goals. Sent to Claude with every job. */
  about: string;
}

export interface PastJob {
  id: string;
  jobTypeId: JobTypeId;
  title: string;
  sizeSf: number; // main quantity in the job type's unit (SF, LF, items; 1 for per-job types)
  finish: FinishLevel;
  price: number; // what the client paid (pre-tax)
  date: string; // ISO date
}

export interface EstimateLine {
  assemblyId: string;
  name: string;
  vi: string;
  trade: Trade;
  qty: number;
  unit: string;
  laborUnit: number;
  labor: number;
  materials: number; // allocated material cost (after purchase rounding)
}

export interface MaterialLine {
  materialId: string;
  name: string;
  category: MaterialCategory;
  rawQty: number;
  qty: number; // rounded up to whole purchase units
  unit: string;
  unitPrice: number;
  total: number;
}

export interface TradeTotal {
  trade: Trade;
  labor: number;
  materials: number;
  cost: number;
  price: number; // cost with markup
}

export type CheckLevel = 'warn' | 'info';

export interface Check {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
}

export interface PriceComparison {
  unit?: PriceUnit; // what sizeSf / pricePerSf are per (SF when missing, for older estimates)
  sizeSf: number;
  pricePerSf: number;
  presetPerSf: number | null;
  historyPerSf: number | null;
  historyCount: number;
  flag: 'ok' | 'high' | 'low' | 'none';
  message: string;
}

export type EstimateStatus = 'draft' | 'sent' | 'won' | 'lost';
export type EstimateMode = 'quick' | 'detailed';

export interface Estimate {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: EstimateStatus;
  mode: EstimateMode;
  jobTypeId: JobTypeId;
  title: string;
  clientName: string;
  address: string;
  description: string; // private job notes — never shown to the client
  scopeNote: string; // optional scope summary shown on the client quote
  aiNotes?: string[]; // internal: things Claude noticed in the notes/photos
  photos: string[];
  finish: FinishLevel;
  answers: Answers;
  customItems: ScopeItem[];
  markupPct: number;
  salesTaxPct: number;
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
  checks: Check[];
  comparison: PriceComparison;
}
