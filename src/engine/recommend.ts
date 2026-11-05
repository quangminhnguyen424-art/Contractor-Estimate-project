// Bidwell's suggestions after a 3D room scan: the scan is of rooms INSIDE a home, so only indoor work is
// suggested (no roofing, siding, decks, fences, concrete or yard work). Suggestions come from the room names
// and sizes the contractor scanned.
import { planTotals, roomMeasures } from './floorplan';
import { JOB_TYPES } from './jobTypes';
import type { JobTypeId, PlanRoom } from './types';

/** Types of work that happen outside the house: never suggested from an indoor scan. */
export const OUTDOOR_TYPES = new Set<JobTypeId>(['roofing', 'siding', 'extpaint', 'deck', 'fence', 'gutters', 'concrete', 'landscape', 'retaining', 'adu', 'newbuild', 'addition', 'commercial']);

/** Indoor work only: the built-in indoor types plus the contractor's own types (they know their work). */
export const isIndoorType = (id: JobTypeId) => {
  const jt = JOB_TYPES.find((j) => j.id === id);
  return !!jt && !OUTDOOR_TYPES.has(id) && jt.category !== 'Exterior' && jt.category !== 'New construction';
};

export interface Suggestion {
  jobTypeId: JobTypeId;
  why: string;
}

const has = (rooms: PlanRoom[], ...words: string[]) => rooms.filter((r) => words.some((w) => r.name.toLowerCase().includes(w)));

/** Indoor jobs that fit the scanned rooms, best first, each with a one-line reason. */
export function suggestFromScan(rooms: PlanRoom[]): Suggestion[] {
  if (!rooms.length) return [];
  const t = planTotals(rooms);
  const out: Suggestion[] = [];
  const add = (id: JobTypeId, why: string) => { if (isIndoorType(id) && !out.some((s) => s.jobTypeId === id)) out.push({ jobTypeId: id, why }); };
  const sf = (list: PlanRoom[]) => Math.round(list.reduce((s, r) => s + roomMeasures(r).floorSf, 0));

  const baths = has(rooms, 'bath', 'restroom', 'powder', 'shower', 'tắm', 'wc');
  const kitchens = has(rooms, 'kitchen', 'bếp', 'pantry');
  const basements = has(rooms, 'basement', 'hầm', 'lower');
  const garages = has(rooms, 'garage');
  if (baths.length) add('bathroom', `${baths.map((r) => r.name).join(', ')}: ${sf(baths)} SF floor`);
  if (kitchens.length) {
    add('kitchen', `${kitchens.map((r) => r.name).join(', ')}: ${sf(kitchens)} SF`);
    add('countertops', 'Kitchen scanned');
  }
  if (basements.length) add('basement', `${basements.map((r) => r.name).join(', ')}: ${sf(basements)} SF`);
  if (garages.length) add('garage', `${garages.map((r) => r.name).join(', ')}: ${sf(garages)} SF`);
  if (t.floorSf >= 1200 || rooms.length >= 5) add('wholehouse', `${rooms.length} rooms, ${Math.round(t.floorSf)} SF in total`);
  add('flooring', `${Math.round(t.floorSf)} SF of floor, ${Math.round(t.baseboardLf)} LF of baseboard`);
  add('painting', `${Math.round(t.wallSf)} SF of walls (doors and windows taken out)`);
  add('drywall', `${Math.round(t.wallSf + t.ceilingSf)} SF of walls and ceilings`);
  if (t.doors) add('doors', `${t.doors} door${t.doors > 1 ? 's' : ''} found`);
  if (t.windows) add('windows', `${t.windows} window${t.windows > 1 ? 's' : ''} found`);
  return out.slice(0, 6);
}

/** Told to Bidwell AI with the job, so it stays inside: no exterior items in an indoor-scan estimate. */
export const INDOOR_NOTE = 'The contractor scanned rooms inside the home with a 3D scan. This is INTERIOR work only: do not add or suggest roofing, siding, exterior paint, decks, fences, gutters, concrete, landscaping or other outside work.';
