import type { WorkProfile } from './types';

export const CLIENT_OPTIONS = [
  { value: 'homeowners', label: 'Homeowners' },
  { value: 'investors', label: 'Investors / landlords' },
  { value: 'managers', label: 'Property managers' },
  { value: 'commercial', label: 'Businesses (commercial)' },
  { value: 'contractors', label: 'Other contractors (I sub)' },
];

export const SIZE_OPTIONS = [
  { value: 'under10', label: 'Under $10k' },
  { value: '10to50', label: '$10k–50k' },
  { value: '50to150', label: '$50k–150k' },
  { value: 'over150', label: 'Over $150k' },
];

export const SUB_OPTIONS = [
  { value: 'demo', label: 'Demo' }, { value: 'framing', label: 'Framing' }, { value: 'drywall', label: 'Drywall' },
  { value: 'plumbing', label: 'Plumbing' }, { value: 'electrical', label: 'Electrical' }, { value: 'hvac', label: 'HVAC' },
  { value: 'tile', label: 'Tile' }, { value: 'cabinets', label: 'Cabinets' }, { value: 'painting', label: 'Painting' },
  { value: 'roofing', label: 'Roofing' }, { value: 'concrete', label: 'Concrete' }, { value: 'flooring', label: 'Flooring' },
];

export const EMPTY_WORK: WorkProfile = { clients: [], jobSizes: [], finish: 'mid', subOut: [], area: '', alwaysInclude: '', neverDo: '' };

const labels = (opts: { value: string; label: string }[], vals: string[]) =>
  vals.map((v) => opts.find((o) => o.value === v)?.label).filter(Boolean).join(', ');

/** The setup interview in plain sentences, for Claude. */
export function workSummary(w?: WorkProfile): string {
  if (!w) return '';
  const lines = [
    w.clients.length ? `Clients: ${labels(CLIENT_OPTIONS, w.clients)}.` : '',
    w.jobSizes.length ? `Usual job size: ${labels(SIZE_OPTIONS, w.jobSizes)}.` : '',
    `Usual finish level: ${w.finish === 'basic' ? 'basic / builder grade' : w.finish === 'high' ? 'high-end' : 'mid-grade'}.`,
    w.subOut.length ? `Subs out: ${labels(SUB_OPTIONS, w.subOut)}. Does the other trades with their own crew.` : 'Does most trades with their own crew.',
    w.area.trim() ? `Works in: ${w.area.trim()}.` : '',
    w.alwaysInclude.trim() ? `Always includes: ${w.alwaysInclude.trim()}.` : '',
    w.neverDo.trim() ? `Never does / always excludes: ${w.neverDo.trim()}.` : '',
  ];
  return lines.filter(Boolean).join(' ');
}
