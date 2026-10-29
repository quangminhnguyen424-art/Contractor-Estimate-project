// Floor plans: rooms from a LiDAR scan or measured by hand, their measurements, a drawing (SVG),
// and the numbers they fill in on an estimate. Plain TypeScript: used by the app and the quote PDF.
import type { Answers, JobType, PlanOpening, PlanRoom, PlanSegment } from './types';

const M_TO_FT = 3.28084;
const M2_TO_SF = 10.7639;
const DOOR = { widthFt: 3, heightFt: 6.67 };
const WINDOW = { widthFt: 3, heightFt: 4 };

const r1 = (n: number) => Math.round(n * 10) / 10;
const len = (s: PlanSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** 12.33 -> 12'4" */
export function ftIn(ft: number): string {
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/** What the native scanner returns (meters). Kept here so the engine doesn't depend on the native module. */
export interface ScanInput {
  walls: ScanSeg[];
  doors: ScanSeg[];
  windows: ScanSeg[];
  openings: ScanSeg[];
  floorAreaM2?: number;
}
interface ScanSeg { x1: number; y1: number; x2: number; y2: number; width: number; height: number; confidence: string }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const okSeg = (s: ScanSeg) => [s.x1, s.y1, s.x2, s.y2, s.width, s.height].every(finite) && s.width > 0.05;

/** A scanned room in feet, moved so its corner sits at (0, 0). */
export function roomFromScan(scan: ScanInput, name: string, id: string): PlanRoom | null {
  const walls = (scan.walls ?? []).filter(okSeg);
  if (walls.length < 3) return null;
  const all = [...walls, ...(scan.doors ?? []), ...(scan.windows ?? []), ...(scan.openings ?? [])].filter(okSeg);
  const xs = walls.flatMap((w) => [w.x1, w.x2]);
  const ys = walls.flatMap((w) => [w.y1, w.y2]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const seg = (s: ScanSeg): PlanSegment => ({
    x1: r1((s.x1 - minX) * M_TO_FT), y1: r1((s.y1 - minY) * M_TO_FT), x2: r1((s.x2 - minX) * M_TO_FT), y2: r1((s.y2 - minY) * M_TO_FT),
  });
  const heights = walls.map((w) => w.height * M_TO_FT).sort((a, b) => a - b);
  const heightFt = r1(heights[Math.floor(heights.length / 2)]);
  const opening = (kind: PlanOpening['kind']) => (s: ScanSeg): PlanOpening => ({
    kind, ...seg(s), widthFt: r1(s.width * M_TO_FT), heightFt: r1(s.height * M_TO_FT),
  });
  const lengthFt = r1((Math.max(...xs) - minX) * M_TO_FT);
  const widthFt = r1((Math.max(...ys) - minY) * M_TO_FT);
  return {
    id, name, source: 'scan', lengthFt, widthFt, heightFt,
    walls: walls.map((w) => ({ ...seg(w), heightFt: r1(w.height * M_TO_FT) })),
    openings: [
      ...(scan.doors ?? []).filter(okSeg).map(opening('door')),
      ...(scan.windows ?? []).filter(okSeg).map(opening('window')),
      ...(scan.openings ?? []).filter(okSeg).map(opening('opening')),
    ],
    floorSf: finite(scan.floorAreaM2) && scan.floorAreaM2 > 0 ? Math.round(scan.floorAreaM2 * M2_TO_SF) : undefined,
    lowConfidence: all.filter((s) => s.confidence === 'low').length,
  };
}

/** A room measured by hand: a rectangle with door and window counts. */
export function manualRoom(id: string, name: string, lengthFt: number, widthFt: number, heightFt: number, doors: number, windows: number): PlanRoom {
  const count = (n: number) => (Number.isFinite(n) ? Math.min(50, Math.max(0, Math.floor(n))) : 0);
  const clampFt = (n: number, max: number, d: number) => (Number.isFinite(n) && n > 0 ? Math.min(n, max) : d);
  return {
    id, name, source: 'manual', lengthFt: clampFt(lengthFt, 999, 1), widthFt: clampFt(widthFt, 999, 1), heightFt: clampFt(heightFt, 30, 8), walls: [],
    openings: [
      ...Array.from({ length: count(doors) }, () => ({ kind: 'door' as const, ...DOOR })),
      ...Array.from({ length: count(windows) }, () => ({ kind: 'window' as const, ...WINDOW })),
    ],
  };
}

export interface RoomMeasures {
  floorSf: number;
  perimeterLf: number;
  wallSf: number; // net of doors and windows
  ceilingSf: number;
  baseboardLf: number; // perimeter less door widths
  doors: number;
  windows: number;
}

export function roomMeasures(r: PlanRoom): RoomMeasures {
  const scanned = r.source === 'scan' && r.walls.length > 0;
  const floorSf = scanned ? r.floorSf ?? r.lengthFt * r.widthFt : r.lengthFt * r.widthFt;
  const perimeterLf = scanned ? r.walls.reduce((t, w) => t + len(w), 0) : 2 * (r.lengthFt + r.widthFt);
  const grossWall = scanned ? r.walls.reduce((t, w) => t + len(w) * w.heightFt, 0) : perimeterLf * r.heightFt;
  const openArea = r.openings.reduce((t, o) => t + o.widthFt * o.heightFt, 0);
  const doorWidth = r.openings.filter((o) => o.kind !== 'window').reduce((t, o) => t + o.widthFt, 0);
  return {
    floorSf: Math.round(floorSf),
    perimeterLf: Math.round(perimeterLf),
    wallSf: Math.round(Math.max(0, grossWall - openArea)),
    ceilingSf: Math.round(floorSf),
    baseboardLf: Math.round(Math.max(0, perimeterLf - doorWidth)),
    doors: r.openings.filter((o) => o.kind === 'door').length,
    windows: r.openings.filter((o) => o.kind === 'window').length,
  };
}

export function planTotals(rooms: PlanRoom[]): RoomMeasures {
  const zero: RoomMeasures = { floorSf: 0, perimeterLf: 0, wallSf: 0, ceilingSf: 0, baseboardLf: 0, doors: 0, windows: 0 };
  return rooms.map(roomMeasures).reduce((t, m) => ({
    floorSf: t.floorSf + m.floorSf, perimeterLf: t.perimeterLf + m.perimeterLf, wallSf: t.wallSf + m.wallSf,
    ceilingSf: t.ceilingSf + m.ceilingSf, baseboardLf: t.baseboardLf + m.baseboardLf, doors: t.doors + m.doors, windows: t.windows + m.windows,
  }), zero);
}

/** Interior work only: a floor plan says nothing about a roof, a fence or a yard. */
const EXTERIOR = ['roofing', 'siding', 'extpaint', 'deck', 'fence', 'gutters', 'concrete', 'landscape', 'retaining', 'adu', 'newbuild'];

/** The estimate answers a floor plan fills in for this type of work, with a line for each. */
export function answersFromPlan(jt: JobType, rooms: PlanRoom[]): { answers: Answers; heard: string[] } {
  const answers: Answers = {};
  const heard: string[] = [];
  if (rooms.length === 0 || EXTERIOR.includes(jt.id) || jt.unit !== 'SF') return { answers, heard };
  const t = planTotals(rooms);
  const has = (id: string) => jt.questions.some((q) => q.id === id);
  const set = (id: string, v: number, label: string) => {
    if (!has(id) || !(v > 0)) return;
    answers[id] = v;
    heard.push(label);
  };
  if (jt.id === 'drywall') set('sizeSf', t.wallSf + t.ceilingSf, `${t.wallSf + t.ceilingSf} SF of walls and ceilings`);
  else if (jt.id === 'insulation') set('sizeSf', t.wallSf, `${t.wallSf} SF of wall`);
  else set('sizeSf', t.floorSf, `${t.floorSf} SF floor`);
  if (jt.id === 'bathroom') set('floorTileSf', t.floorSf, `${t.floorSf} SF floor tile`);
  if (jt.id === 'flooring') set('baseboardLf', t.baseboardLf, `${t.baseboardLf} LF baseboard`);
  return { answers, heard: heard.map((h) => `${h} (floor plan)`) };
}

// ---- Drawing ----

// Text content only (never attributes), so quotes stay as typed: some SVG renderers show &quot; literally.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Placed { room: PlanRoom; ox: number; oy: number; w: number; h: number }

/**
 * Draws the rooms as a floor plan (SVG). Scanned rooms show their real walls, doors (orange) and windows (blue)
 * with wall lengths; measured rooms are rectangles. Rooms are laid out side by side, each with its own labels.
 */
export function planSvg(rooms: PlanRoom[], widthPx = 640): string {
  if (rooms.length === 0) return '';
  const pad = 14;
  const charPx = 6.6; // generous width of one label character at the label font sizes
  const labelOf = (r: PlanRoom) => {
    const m = roomMeasures(r);
    const extra = [m.doors ? `${m.doors} door${m.doors > 1 ? 's' : ''}` : '', m.windows ? `${m.windows} window${m.windows > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    return { title: `${r.name} · ${m.floorSf} SF`, detail: `${ftIn(r.heightFt)} ceiling${extra ? ` · ${extra}` : ''}` };
  };
  // Lay rooms out side by side at one scale, wrapping to a new row when the next room (or its labels) won't fit.
  // Each room takes at least the width of its labels, so text never runs into the next room or off the drawing.
  const avail = widthPx - pad * 2;
  const scale = avail / Math.max(36, ...rooms.map((r) => r.lengthFt));
  const gapPx = 18;
  const labelPx = 40; // two lines of label under each room
  const placed: Placed[] = [];
  let xPx = 0;
  let yPx = 0;
  let rowPx = 0;
  for (const room of rooms) {
    const l = labelOf(room);
    const textPx = Math.min(avail, Math.max(l.title.length, l.detail.length) * charPx);
    const wPx = Math.max(Math.max(room.lengthFt, 4) * scale, textPx);
    const hPx = Math.max(room.widthFt, 4) * scale;
    if (xPx > 0 && xPx + wPx > avail) { xPx = 0; yPx += rowPx + labelPx + gapPx; rowPx = 0; }
    placed.push({ room, ox: xPx / scale, oy: yPx / scale, w: wPx / scale, h: hPx / scale });
    xPx += wPx + gapPx;
    rowPx = Math.max(rowPx, hPx);
  }
  const heightPx = Math.ceil(yPx + rowPx + labelPx + pad * 2);
  const X = (p: Placed, fx: number) => (pad + (p.ox + fx) * scale).toFixed(1);
  const Y = (p: Placed, fy: number) => (pad + (p.oy + fy) * scale).toFixed(1);
  const line = (p: Placed, s: PlanSegment, color: string, width: number) =>
    `<line x1="${X(p, s.x1)}" y1="${Y(p, s.y1)}" x2="${X(p, s.x2)}" y2="${Y(p, s.y2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;

  const parts: string[] = [];
  for (const p of placed) {
    const { room } = p;
    if (room.source === 'scan' && room.walls.length) {
      for (const w of room.walls) {
        parts.push(line(p, w, '#1B1E22', 4));
        const l = len(w);
        if (l >= 2.5 && scale * l > 40) {
          const mx = (w.x1 + w.x2) / 2;
          const my = (w.y1 + w.y2) / 2;
          parts.push(`<text x="${X(p, mx)}" y="${Y(p, my)}" dy="-5" font-size="10" text-anchor="middle" fill="#5B6168">${ftIn(l)}</text>`);
        }
      }
      for (const o of room.openings) {
        if (![o.x1, o.y1, o.x2, o.y2].every((n) => typeof n === 'number')) continue;
        const s = o as PlanSegment;
        if (o.kind === 'window') parts.push(line(p, s, '#2563EB', 3));
        else parts.push(line(p, s, '#FFFFFF', 5), line(p, s, '#C2410C', 2));
      }
    } else {
      parts.push(`<rect x="${X(p, 0)}" y="${Y(p, 0)}" width="${(room.lengthFt * scale).toFixed(1)}" height="${(room.widthFt * scale).toFixed(1)}" fill="#F7F6F2" stroke="#1B1E22" stroke-width="3"/>`);
      parts.push(`<text x="${X(p, room.lengthFt / 2)}" y="${Y(p, 0)}" dy="-4" font-size="10" text-anchor="middle" fill="#5B6168">${ftIn(room.lengthFt)}</text>`);
      parts.push(`<text x="${X(p, 0)}" y="${Y(p, room.widthFt / 2)}" dx="5" dy="3" font-size="10" text-anchor="start" fill="#5B6168">${ftIn(room.widthFt)}</text>`);
    }
    const label = labelOf(room);
    const lx = X(p, 0);
    const below = Y(p, Math.max(room.widthFt, 4));
    parts.push(`<text x="${lx}" y="${below}" dy="16" font-size="12" font-weight="700" fill="#1B1E22">${esc(label.title)}</text>`);
    parts.push(`<text x="${lx}" y="${below}" dy="30" font-size="10" fill="#5B6168">${esc(label.detail)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" font-family="-apple-system, Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}
