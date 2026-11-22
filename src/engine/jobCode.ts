// A short code for each job ("11752", "MYRTLE") that the crew gives as the Job Name / PO at a store's register.
// Receipts carry it back, and that is how a purchase finds its project without anyone sorting it by hand.
import type { SiteProject } from './site';

const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
const LABELS = new Set(['PO', 'JOB', 'NAME', 'JOBNAME', 'NO', 'NUMBER']);
const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A code as typed or printed, reduced to what is compared: upper-case letters and digits, without a "PO" / "Job name" label. */
export function normCode(s: string): string {
  const t = s.toUpperCase().replace(/^\s*(JOB\s*NAME|JOB|P\.?\s*O\.?)\s*(#|NO\.?|NUMBER)?\s*[:#-]?\s*/, '');
  return alnum(t);
}

/** A new job's code: the house number, else the street name, else the first word of the title. Never one already in use. */
export function jobCodeFor(address: string, title: string, taken: string[]): string {
  const words = address.split(',')[0].trim().split(/\s+/).filter(Boolean);
  const number = /^\d+$/.test(words[0] ?? '') ? words[0] : '';
  const street = words.slice(number ? 1 : 0).map(alnum).find((w) => w.length > 1 && !DIRECTIONS.has(w) && !/^\d+(ST|ND|RD|TH)?$/.test(w)) ?? '';
  const first = alnum(title.trim().split(/\s+/)[0] ?? '');
  const base = (number.length >= 3 ? number : number ? `${number}${street}` : street || first || 'JOB').slice(0, 10);
  const used = new Set(taken.map(normCode));
  if (!used.has(normCode(base))) return base;
  for (let n = 2; ; n++) if (!used.has(normCode(`${base}-${n}`))) return `${base}-${n}`;
}

/** A project's code; projects made before codes existed get the one their address gives. */
export function codeOf(p: SiteProject): string {
  return p.code?.trim() || jobCodeFor(p.address, p.title, []);
}

/**
 * The project a job name / PO on a receipt points to, or null. Only a whole code counts ("117" is not "11752"), and
 * a code two open projects share points to neither: a wrong job is worse than asking.
 */
export function matchCode(text: string, projects: SiteProject[]): SiteProject | null {
  const said = new Set([normCode(text), ...text.split(/[^A-Za-z0-9-]+/).map(alnum).filter((w) => w && !LABELS.has(w))]);
  said.delete('');
  if (!said.size) return null;
  const hits = projects.filter((p) => said.has(normCode(codeOf(p))));
  const open = hits.filter((p) => p.status === 'active');
  const pool = open.length ? open : hits;
  return pool.length === 1 ? pool[0] : null;
}
