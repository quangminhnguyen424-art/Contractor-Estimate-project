// Job site: projects after a job is won. Room-by-room photos with drawings and instructions, tasks the
// crew checks off with "after" photos, daily logs, client updates and marketing posts. Plain TypeScript.
import { money } from './format';
import type { Estimate } from './types';

export type ShapeKind = 'arrow' | 'circle' | 'line' | 'text';
export type MarkColor = 'red' | 'yellow' | 'white';

/** A drawing on a photo, in the photo's own pixels (so it lines up at any display size). */
export interface MarkupShape {
  id: string;
  kind: ShapeKind;
  color: MarkColor;
  x1: number; y1: number; x2: number; y2: number; // text: (x1, y1) is where it sits
  text?: string; // text label, or a measurement on a line ("12 in")
}

export type PhotoKind = 'before' | 'progress' | 'after';

export interface SitePhoto {
  id: string;
  uri: string;
  w: number; // pixel size, for the drawing layer
  h: number;
  kind: PhotoKind;
  note: string; // what to do here, in the contractor's words
  markup: MarkupShape[];
  takenAt: string;
}

export type CrewLang = 'en' | 'vi' | 'es';

export interface SiteTask {
  id: string;
  text: string; // English (or however the contractor wrote it)
  tr?: Partial<Record<CrewLang, string>>; // saved translations
  done: boolean;
  doneAt?: string;
  photoId?: string; // a photo that shows where/what (before)
  afterPhotoId?: string; // the finished result
}

export interface SiteRoom {
  id: string;
  name: string;
  notes: string; // instructions for the room as a whole
  photos: SitePhoto[];
  tasks: SiteTask[];
}

export interface DailyLog {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
}

export interface SiteProject {
  id: string;
  estimateId?: string;
  title: string;
  clientName: string;
  address: string;
  status: 'active' | 'done';
  createdAt: string;
  rooms: SiteRoom[];
  logs: DailyLog[];
  /** When photos were last sent to the client, to remind the contractor to keep them updated. */
  lastClientUpdateAt?: string;
  /** Costs, receipts, buy list and tax settings (the project dashboard). */
  money?: import('./books').ProjectMoney;
}

export const COLOR_HEX: Record<MarkColor, string> = { red: '#E11D48', yellow: '#FACC15', white: '#FFFFFF' };

export const LANG_NAMES: Record<CrewLang, { en: string; native: string }> = {
  en: { en: 'English', native: 'English' },
  vi: { en: 'Vietnamese', native: 'Tiếng Việt' },
  es: { en: 'Spanish', native: 'Español' },
};

// ---- Creating ----

/** A new project from a won estimate: its rooms come from the floor plan, else one room named for the work. */
export function projectFromEstimate(est: Estimate, jobName: string, id: string, newId: () => string): SiteProject {
  const roomNames = est.plan?.length ? est.plan.map((r) => r.name) : [jobName];
  return {
    id, estimateId: est.id, title: est.title, clientName: est.clientName, address: est.address, status: 'active',
    createdAt: new Date().toISOString(), logs: [],
    rooms: roomNames.map((name) => emptyRoom(newId(), name)),
  };
}

export const emptyRoom = (id: string, name: string): SiteRoom => ({ id, name, notes: '', photos: [], tasks: [] });

// ---- Progress ----

export function roomProgress(r: SiteRoom) {
  const done = r.tasks.filter((t) => t.done).length;
  return { done, total: r.tasks.length, photos: r.photos.length };
}

export function projectProgress(p: SiteProject) {
  const all = p.rooms.flatMap((r) => r.tasks);
  const done = all.filter((t) => t.done).length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0, photos: p.rooms.reduce((t, r) => t + r.photos.length, 0) };
}

export interface BeforeAfter { room: string; label: string; before: SitePhoto; after: SitePhoto }

/**
 * Before and after pairs: each finished task that has both a "where" photo and an "after" photo, plus for each
 * room its first "before" photo with its last "after" photo when no task paired them.
 */
/** Tasks that are questions for the contractor ("Ask: …") are internal and never shown to the client. */
export const isQuestion = (t: SiteTask) => /^ask\s*:/i.test(t.text.trim());

export function beforeAfterPairs(p: SiteProject): BeforeAfter[] {
  const out: BeforeAfter[] = [];
  for (const r of p.rooms) {
    const byId = new Map(r.photos.map((ph) => [ph.id, ph]));
    const used = new Set<string>();
    for (const t of r.tasks) {
      const b = t.photoId ? byId.get(t.photoId) : undefined;
      const a = t.afterPhotoId ? byId.get(t.afterPhotoId) : undefined;
      if (b && a && b.id !== a.id) { out.push({ room: r.name, label: t.text, before: b, after: a }); used.add(b.id); used.add(a.id); }
    }
    const before = r.photos.find((ph) => ph.kind === 'before' && !used.has(ph.id));
    const after = [...r.photos].reverse().find((ph) => ph.kind === 'after' && !used.has(ph.id));
    if (before && after) out.push({ room: r.name, label: r.name, before, after });
  }
  return out;
}

/** What happened on a given day: photos taken and tasks finished, by room. */
/** The phone's own calendar day (YYYY-MM-DD) for a moment, so "today" means today where the contractor is. */
export function localDay(at: string | Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayActivity(p: SiteProject, date: string) {
  return p.rooms.map((r) => ({
    room: r.name,
    photos: r.photos.filter((ph) => localDay(ph.takenAt) === date),
    done: r.tasks.filter((t) => t.done && !!t.doneAt && localDay(t.doneAt) === date),
    open: r.tasks.filter((t) => !t.done),
  })).filter((x) => x.photos.length || x.done.length || x.open.length);
}

// ---- Drawing on photos ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG elements for a photo's drawings, in its pixel space. Used on screen and in PDFs, so both match. */
export function markupElements(shapes: MarkupShape[], w: number, h: number): string {
  const sw = Math.max(3, Math.round(Math.min(w, h) / 120)); // stroke scales with the photo
  const font = Math.max(16, Math.round(Math.min(w, h) / 22));
  const out: string[] = [];
  for (const s of shapes) {
    const c = COLOR_HEX[s.color] ?? COLOR_HEX.red;
    const outline = s.color === 'white' ? '#111111' : '#FFFFFF';
    if (s.kind === 'circle') {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
      const rx = Math.max(sw * 2, Math.abs(s.x2 - s.x1) / 2), ry = Math.max(sw * 2, Math.abs(s.y2 - s.y1) / 2);
      out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${outline}" stroke-opacity="0.6" stroke-width="${sw + 3}"/>`);
      out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${c}" stroke-width="${sw}"/>`);
    } else if (s.kind === 'arrow' || s.kind === 'line') {
      out.push(`<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${outline}" stroke-opacity="0.6" stroke-width="${sw + 3}" stroke-linecap="round"/>`);
      out.push(`<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`);
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = (x: number, y: number, a: number) => {
        const len = sw * 5;
        const p1 = [x - len * Math.cos(a - 0.45), y - len * Math.sin(a - 0.45)];
        const p2 = [x - len * Math.cos(a + 0.45), y - len * Math.sin(a + 0.45)];
        return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}" fill="${c}" stroke="${outline}" stroke-opacity="0.6" stroke-width="2"/>`;
      };
      if (s.kind === 'arrow') out.push(head(s.x2, s.y2, ang));
      else { out.push(head(s.x2, s.y2, ang), head(s.x1, s.y1, ang + Math.PI)); }
      if (s.kind === 'line' && s.text?.trim()) out.push(label((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, s.text, c, font));
    } else if (s.kind === 'text' && s.text?.trim()) {
      out.push(label(s.x1, s.y1, s.text, c, font));
    }
  }
  return out.join('');
}

/** A label with a dark plate behind it so it reads on any photo. */
function label(x: number, y: number, text: string, color: string, font: number): string {
  const t = esc(text.trim().slice(0, 60));
  const wEst = Math.ceil(t.length * font * 0.58) + font;
  return `<rect x="${(x - wEst / 2).toFixed(1)}" y="${(y - font * 0.85).toFixed(1)}" width="${wEst}" height="${(font * 1.35).toFixed(1)}" rx="${(font * 0.3).toFixed(1)}" fill="#000000" fill-opacity="0.65"/>`
    + `<text x="${x.toFixed(1)}" y="${(y + font * 0.3).toFixed(1)}" font-size="${font}" font-weight="700" font-family="-apple-system, Helvetica, Arial, sans-serif" text-anchor="middle" fill="${color === COLOR_HEX.yellow || color === COLOR_HEX.white ? color : '#FFFFFF'}">${t}</text>`;
}

export function markupSvg(shapes: MarkupShape[], w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${markupElements(shapes, w, h)}</svg>`;
}

// ---- AI prompts (the app sends these to Claude; answers are checked before use) ----

export function stepsPrompt(room: SiteRoom, project: SiteProject): string {
  const photoNotes = room.photos.map((p, i) => `Photo ${i + 1} (${p.kind})${p.note.trim() ? `: ${p.note.trim()}` : ''}`).join('\n');
  return `You are a general contractor writing work instructions for your crew in one room of a job.
Job: ${project.title}. Room: ${room.name}.
Turn the contractor's notes into clear, separate tasks a worker can do and check off. One action per task, in the order to do them. Keep measurements, heights and product names exactly as given. Do not add work the contractor did not ask for; if something is unclear, add a task starting with "Ask:".
Contractor's notes for the room:
${room.notes.trim() || '(none)'}
Notes on the photos (photos are attached in this order when available):
${photoNotes || '(no photos)'}
Reply with ONLY a JSON array of strings, e.g. ["Remove the vanity and cap the supply lines", "Move the outlet 12 in left, box at 44 in AFF"]. At most 20 tasks.`;
}

export function translatePrompt(texts: string[], lang: CrewLang): string {
  return `Translate these construction work instructions into ${LANG_NAMES[lang].en} for a crew member. Use the words tradespeople actually use on site. Keep numbers, measurements, units (in, ft, SF, AFF) and product names exactly as written. Keep the same order.
Reply with ONLY a JSON array of ${texts.length} strings.
${JSON.stringify(texts)}`;
}

export function dailyLogPrompt(p: SiteProject, date: string): string {
  const act = dayActivity(p, date).map((a) =>
    `${a.room}: ${a.done.length} task(s) finished${a.done.length ? ` (${a.done.map((t) => t.text).join('; ')})` : ''}; ${a.photos.length} photo(s)${a.photos.filter((x) => x.note.trim()).map((x) => ` [${x.kind}: ${x.note.trim()}]`).join('')}; still open: ${a.open.length}`).join('\n');
  return `Write a short daily log for a construction job, in plain English, the way a superintendent would.
Job: ${p.title}${p.address ? `, ${p.address}` : ''}. Date: ${date}.
What happened today, by room:
${act || '(nothing recorded today)'}
Write 3 to 6 short lines: work done, what's next, anything to watch. Only use the facts above. No headings, no markdown.`;
}

export function clientUpdatePrompt(p: SiteProject, lang: 'en' | 'vi'): string {
  const rooms = p.rooms.map((r) => {
    const pr = roomProgress(r);
    return `${r.name}: ${pr.done} of ${pr.total} tasks done${r.tasks.some((t) => t.done && !isQuestion(t)) ? ` (${r.tasks.filter((t) => t.done && !isQuestion(t)).map((t) => t.text).join('; ')})` : ''}`;
  }).join('\n');
  return `Write a friendly progress update from a contractor to their client${p.clientName ? `, ${p.clientName}` : ''}, in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
Job: ${p.title}. Progress by room:
${rooms}
4 to 7 short lines: what's finished, what's next, a thank-you. Plain text, no prices, no internal notes, no promises of dates that aren't given.`;
}

export function postPrompt(p: SiteProject, pairs: number, lang: 'en' | 'vi'): string {
  const done = p.rooms.flatMap((r) => r.tasks.filter((t) => t.done).map((t) => `${r.name}: ${t.text}`)).slice(0, 25);
  return `Write a Facebook post for a contractor showing a finished job, in ${lang === 'vi' ? 'Vietnamese (natural, for the Vietnamese community in the Seattle area)' : 'English'}.
Job: ${p.title}. ${pairs} before-and-after photo pair(s) will be attached.
Work done:
${done.join('\n') || p.rooms.map((r) => r.name).join(', ')}
Keep it short: a hook line, 2-4 lines on the work, a call to message for a free estimate, 3-5 hashtags. Never include the client's name or address, and no prices.`;
}

/** First JSON array of strings in a reply. */
export function parseStringArray(reply: string, max = 30): string[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error("Bidwell's answer couldn't be read. Try again.");
  let raw: unknown;
  try { raw = JSON.parse(reply.slice(start, end + 1)); } catch { throw new Error("Bidwell's answer couldn't be read. Try again."); }
  if (!Array.isArray(raw)) throw new Error("Bidwell's answer couldn't be read. Try again.");
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 300)).slice(0, max);
}

// ---- PDFs ----

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1B1E22;margin:32px;font-size:13px;line-height:1.45}
h1{font-size:20px;margin:0 0 2px}h2{font-size:16px;margin:26px 0 8px;padding-top:10px;border-top:2px solid #C2410C}
.muted{color:#5B6168}.ph{position:relative;display:inline-block;width:100%;margin:8px 0 2px;page-break-inside:avoid}
.ph img{width:100%;display:block;border-radius:6px}.ph svg{position:absolute;left:0;top:0;width:100%;height:100%}
.note{font-weight:600;margin:2px 0 10px}ol{padding-left:20px}li{margin:6px 0;page-break-inside:avoid}
.box{display:inline-block;width:12px;height:12px;border:1.5px solid #1B1E22;margin-right:8px;vertical-align:-2px}
.orig{color:#5B6168;font-size:11px}.pair{display:flex;gap:8px;page-break-inside:avoid}.pair div{flex:1}.grid{display:flex;flex-wrap:wrap;gap:8px}.grid>div{width:calc(50% - 4px);page-break-inside:avoid}
.tag{font-size:11px;font-weight:700;letter-spacing:.05em;color:#5B6168;text-transform:uppercase}
</style></head><body>${body}</body></html>`;

/** Only embedded JPEG/PNG data goes into a PDF, so a damaged or tampered photo address can't inject anything. */
const SAFE_SRC = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

const photoBlock = (ph: SitePhoto, src: string, drawings = true) =>
  `<div class="ph">${SAFE_SRC.test(src) ? `<img src="${src}" alt="">` : ''}${drawings && ph.markup.length ? `<svg viewBox="0 0 ${ph.w} ${ph.h}" preserveAspectRatio="none">${markupElements(ph.markup, ph.w, ph.h)}</svg>` : ''}</div>`;

const WO_TEXT: Record<CrewLang, { title: string; tasks: string; notes: string; photo: string; done: string }> = {
  en: { title: 'Work order', tasks: 'Tasks', notes: 'Notes', photo: 'Photo', done: 'Done' },
  vi: { title: 'Phiếu công việc', tasks: 'Việc cần làm', notes: 'Ghi chú', photo: 'Ảnh', done: 'Xong' },
  es: { title: 'Orden de trabajo', tasks: 'Tareas', notes: 'Notas', photo: 'Foto', done: 'Hecho' },
};

/**
 * The crew's instructions, room by room: each photo with its drawings and note, then the tasks with check boxes.
 * `photoSrc` gives an embeddable image source (data: URL) for each photo id; translations are used when present.
 */
export function workOrderHtml(p: SiteProject, roomIds: string[], lang: CrewLang, photoSrc: Record<string, string>, companyName: string): string {
  const T = WO_TEXT[lang];
  const tr = (t: SiteTask) => (lang === 'en' ? t.text : t.tr?.[lang] ?? t.text);
  const rooms = p.rooms.filter((r) => roomIds.includes(r.id));
  const body = rooms.map((r) => {
    const open = r.tasks.filter((t) => !t.done);
    // Numbered as in the app (the room's photo order), so "photo 3" on a task means the same photo everywhere.
    const no = (id: string) => r.photos.findIndex((ph) => ph.id === id) + 1;
    const photos = r.photos.filter((ph) => ph.kind !== 'after' && photoSrc[ph.id]);
    return `<h2>${esc(r.name)}</h2>
${r.notes.trim() ? `<div><b>${T.notes}:</b> ${esc(r.notes.trim())}</div>` : ''}
${open.length ? `<div class="tag">${T.tasks}</div><ol>${open.map((t) => {
      const shown = tr(t);
      const photoNo = t.photoId && photos.some((ph) => ph.id === t.photoId) ? no(t.photoId) : 0;
      return `<li><span class="box"></span>${esc(shown)}${photoNo > 0 ? ` <span class="muted">(${T.photo} ${photoNo})</span>` : ''}${lang !== 'en' && shown !== t.text ? `<div class="orig">${esc(t.text)}</div>` : ''}</li>`;
    }).join('')}</ol>` : ''}
${photos.map((ph) => `<div class="tag">${T.photo} ${no(ph.id)}</div>${photoBlock(ph, photoSrc[ph.id])}${ph.note.trim() ? `<div class="note">${esc(ph.note.trim())}</div>` : ''}`).join('')}`;
  }).join('');
  return page(`${T.title} — ${p.title}`, `<h1>${T.title}: ${esc(p.title)}</h1>
<div class="muted">${esc(companyName)}${p.address ? ` · ${esc(p.address)}` : ''} · ${new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : lang === 'es' ? 'es-US' : 'en-US')}</div>${body}`);
}

/** Progress update for the client: finished work and before/after photos. Never prices or internal notes. */
export function clientUpdateHtml(p: SiteProject, message: string, photoSrc: Record<string, string>, companyName: string, lang: 'en' | 'vi', recentIds: string[] = []): string {
  const L = lang === 'vi'
    ? { title: 'Cập nhật tiến độ', done: 'Đã hoàn thành', ba: 'Trước và sau', before: 'Trước', after: 'Sau', latest: 'Hình ảnh mới nhất' }
    : { title: 'Progress update', done: 'Finished', ba: 'Before and after', before: 'Before', after: 'After', latest: 'Latest photos' };
  // Latest photos: room and date only. Photo notes are instructions for the crew, so they stay off the client's copy.
  const recent = p.rooms.flatMap((r) => r.photos.filter((ph) => recentIds.includes(ph.id) && photoSrc[ph.id]).map((ph) => ({ r, ph })));
  const prog = projectProgress(p);
  const pairs = beforeAfterPairs(p).filter((x) => photoSrc[x.before.id] && photoSrc[x.after.id] && !/^ask\s*:/i.test(x.label.trim()));
  const done = p.rooms.map((r) => ({ r, tasks: r.tasks.filter((t) => t.done && !isQuestion(t)) })).filter((x) => x.tasks.length);
  return page(`${L.title} — ${p.title}`, `<h1>${L.title}: ${esc(p.title)}</h1>
<div class="muted">${esc(companyName)} · ${prog.pct}% · ${new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}</div>
<p>${esc(message).replace(/\n/g, '<br>')}</p>
${done.length ? `<h2>${L.done}</h2>${done.map((x) => `<div><b>${esc(x.r.name)}</b><ul>${x.tasks.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul></div>`).join('')}` : ''}
${recent.length ? `<h2>${L.latest}</h2><div class="grid">${recent.map(({ r, ph }) => `<div>${photoBlock(ph, photoSrc[ph.id], false)}<div class="muted">${esc(r.name)} · ${new Date(ph.takenAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}</div></div>`).join('')}</div>` : ''}
${pairs.length ? `<h2>${L.ba}</h2>${pairs.map((x) => `<div class="tag">${esc(x.room)} · ${esc(x.label)}</div><div class="pair"><div><div class="muted">${L.before}</div>${photoBlock(x.before, photoSrc[x.before.id], false)}</div><div><div class="muted">${L.after}</div>${photoBlock(x.after, photoSrc[x.after.id], false)}</div></div>`).join('')}` : ''}`);
}

/** Short summary line for lists: "3 rooms · 8 of 14 tasks · 22 photos". */
export function projectSummary(p: SiteProject): string {
  const pr = projectProgress(p);
  return `${p.rooms.length} room${p.rooms.length === 1 ? '' : 's'} · ${pr.done} of ${pr.total} tasks · ${pr.photos} photo${pr.photos === 1 ? '' : 's'}`;
}

/** Contract value line for the internal project screen (never on crew or client PDFs). */
export const contractLine = (est?: Estimate) => (est ? `Contract ${money(est.price)} before tax` : '');
