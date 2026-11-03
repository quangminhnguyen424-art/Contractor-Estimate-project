import { describe, expect, it, vi } from 'vitest';

import { sanitizeProjects } from '../store/sanitize';
import type { EstimatorAI } from './ai';
import { manualRoom } from './floorplan';
import {
  beforeAfterPairs, clientUpdateHtml, dayActivity, markupElements, parseStringArray, projectFromEstimate, projectProgress,
  workOrderHtml, type SitePhoto, type SiteProject,
} from './site';
import { stepsFor, translateAll } from './siteAI';
import type { Estimate } from './types';

const photo = (id: string, kind: SitePhoto['kind'], takenAt = '2026-11-02T15:00:00Z', note = ''): SitePhoto =>
  ({ id, uri: `data:image/jpeg;base64,${id}`, w: 1200, h: 900, kind, note, markup: [], takenAt });

const project = (): SiteProject => ({
  id: 'p1', title: 'Kim bath', clientName: 'Mrs Kim', address: '12 Main St', status: 'active', createdAt: '2026-11-01', logs: [],
  rooms: [
    {
      id: 'r1', name: 'Hall bath', notes: 'Demo to studs', photos: [photo('b1', 'before', '2026-11-02T15:00:00Z', 'Outlet moves left'), photo('a1', 'after'), photo('b2', 'before'), photo('a2', 'after')],
      tasks: [
        { id: 't1', text: 'Move outlet 12 in left', done: true, doneAt: '2026-11-02T20:00:00Z', photoId: 'b1', afterPhotoId: 'a1', tr: { vi: 'Dời ổ cắm sang trái 12 in' } },
        { id: 't2', text: 'Install GFCI at vanity', done: false, photoId: 'b2' },
      ],
    },
    { id: 'r2', name: 'Hallway', notes: '', photos: [], tasks: [{ id: 't3', text: 'Patch drywall', done: false }] },
  ],
});

const mockAI = (reply: string) => ({ complete: vi.fn(async () => reply) }) as unknown as EstimatorAI & { complete: ReturnType<typeof vi.fn> };

describe('job site projects', () => {
  it('starts a project from a won estimate with rooms from its floor plan', () => {
    let n = 0;
    const est = { id: 'e1', title: 'Hall bath', clientName: 'Kim', address: '12 Main', plan: [manualRoom('x', 'Bath', 8, 5, 8, 1, 0), manualRoom('y', 'Laundry', 6, 6, 8, 1, 0)] } as unknown as Estimate;
    const p = projectFromEstimate(est, 'Bathroom remodel', 'p', () => `id${n++}`);
    expect(p.rooms.map((r) => r.name)).toEqual(['Bath', 'Laundry']);
    expect(projectFromEstimate({ ...est, plan: undefined }, 'Bathroom remodel', 'p', () => 'z').rooms.map((r) => r.name)).toEqual(['Bathroom remodel']);
  });
  it('counts progress, pairs before and after photos, and finds the day’s work', () => {
    const p = project();
    expect(projectProgress(p)).toMatchObject({ done: 1, total: 3, pct: 33, photos: 4 });
    const pairs = beforeAfterPairs(p);
    expect(pairs.map((x) => [x.before.id, x.after.id, x.label])).toEqual([['b1', 'a1', 'Move outlet 12 in left'], ['b2', 'a2', 'Hall bath']]);
    const day = dayActivity(p, '2026-11-02');
    expect(day[0]).toMatchObject({ room: 'Hall bath' });
    expect(day[0].done.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('drawings on photos', () => {
  it('draws arrows, circles, measurements and labels without junk', () => {
    const svg = markupElements([
      { id: '1', kind: 'arrow', color: 'red', x1: 10, y1: 10, x2: 200, y2: 120 },
      { id: '2', kind: 'circle', color: 'yellow', x1: 300, y1: 300, x2: 400, y2: 380 },
      { id: '3', kind: 'line', color: 'white', x1: 50, y1: 600, x2: 500, y2: 600, text: '44 in AFF' },
      { id: '4', kind: 'text', color: 'red', x1: 600, y1: 100, x2: 600, y2: 100, text: 'Move <here>' },
      { id: '5', kind: 'text', color: 'red', x1: 1, y1: 1, x2: 1, y2: 1, text: '   ' },
    ], 1200, 900);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('44 in AFF');
    expect(svg).toContain('Move &lt;here&gt;');
    expect((svg.match(/<polygon/g) ?? []).length).toBe(3); // arrow head + two ends of the measurement
    expect(svg).not.toContain('NaN');
  });
});

describe('crew and client PDFs', () => {
  it('work order: open tasks in the crew’s language with English underneath, photos numbered, no prices', () => {
    const p = project();
    p.rooms[0].tasks[0].done = false;
    const html = workOrderHtml(p, ['r1'], 'vi', { b1: 'data:image/jpeg;base64,AAA', b2: 'data:image/jpeg;base64,BBB' }, 'Upgrade Home');
    expect(html).toContain('Phiếu công việc');
    expect(html).toContain('Dời ổ cắm sang trái 12 in');
    expect(html).toContain('<div class="orig">Move outlet 12 in left</div>');
    expect(html).toContain('Install GFCI at vanity'); // not translated yet: shown as written
    expect(html).toContain('(Ảnh 1)');
    expect(html).toContain('(Ảnh 3)'); // numbered as in the app: b2 is the room's third photo
    expect(html).not.toContain('Ảnh 2<'); // a1 is an after photo, not on the work order
    expect(html).toContain('Outlet moves left');
    expect(html).not.toContain('Hallway');
    expect(html).not.toMatch(/\$\d/);
  });
  it('client update: finished work and before/after, never prices', () => {
    const p = project();
    p.rooms[0].photos[0].markup = [{ id: 'm', kind: 'arrow', color: 'red', x1: 1, y1: 1, x2: 300, y2: 300 }];
    p.rooms[1].tasks.push({ id: 't9', text: 'Ask: which tile?', done: true });
    const html = clientUpdateHtml(p, 'Hi! Great progress.', { b1: 'data:image/jpeg;base64,AAA', a1: '" onerror="x' }, 'Upgrade Home', 'en');
    expect(html).toContain('Move outlet 12 in left');
    expect(html).not.toContain('<svg'); // the crew's drawings stay off the client's copy
    expect(html).not.toContain('which tile');
    expect(html).not.toContain('onerror');
    expect(html).toContain('Before');
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toContain('Install GFCI');
  });
});

describe('Claude for the job site', () => {
  it('turns notes into a checked task list', async () => {
    const ai = mockAI('Here:\n["Remove vanity", "  ", "Cap supply lines", 7]');
    expect(await stepsFor(ai, project().rooms[0], project())).toEqual(['Remove vanity', 'Cap supply lines']);
    expect(ai.complete.mock.calls[0][0]).toContain('Demo to studs');
  });
  it('never keeps a translation it can’t line up with its task', async () => {
    // One item short: the order can't be trusted, so nothing is used.
    expect(await translateAll(mockAI('["Một"]'), ['One', 'Two'], 'vi')).toEqual([undefined, undefined]);
    // A blank item is just that one missing, the rest stay in place.
    expect(await translateAll(mockAI('["Một", "  ", "Ba"]'), ['One', 'Two', 'Three'], 'vi')).toEqual(['Một', undefined, 'Ba']);
    const ai = mockAI('[]');
    expect(await translateAll(ai, ['One'], 'en')).toEqual([undefined]);
    expect(ai.complete).not.toHaveBeenCalled();
  });
  it('translates long lists in batches', async () => {
    const texts = Array.from({ length: 45 }, (_, i) => `Task ${i}`);
    const ai = { complete: vi.fn(async (prompt: string) => {
      const n = (prompt.match(/"Task \d+"/g) ?? []).length;
      return JSON.stringify(Array.from({ length: n }, (_, i) => `T${i}`));
    }) } as unknown as EstimatorAI & { complete: ReturnType<typeof vi.fn> };
    const out = await translateAll(ai, texts, 'es');
    expect(ai.complete).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(45);
    expect(out.every(Boolean)).toBe(true);
  });
  it('rejects unreadable answers with a clear message', () => {
    expect(() => parseStringArray('no list here')).toThrow(/couldn't be read/);
  });
});

describe('saved job site data', () => {
  it('drops broken projects, photos, drawings and links to missing photos', () => {
    const out = sanitizeProjects([
      { ...project(), rooms: [{ ...project().rooms[0], photos: [photo('b1', 'before'), { id: 'bad' }], tasks: [
        { id: 't1', text: 'A', done: true, photoId: 'b1', afterPhotoId: 'gone' }, { id: 't2', text: '' },
      ] }] },
      { id: 'p1', title: 'dup' },
      'junk',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rooms[0].photos.map((x) => x.id)).toEqual(['b1']);
    expect(out[0].rooms[0].tasks).toEqual([{ id: 't1', text: 'A', done: true, photoId: 'b1' }]);
  });
});

describe('photo addresses', () => {
  it('keeps only the places photos are allowed to live', () => {
    const base = { w: 10, h: 10, kind: 'before', note: '', markup: [], takenAt: '2026-11-02T15:00:00Z' };
    const out = sanitizeProjects([{ ...project(), rooms: [{ id: 'r', name: 'R', notes: '', tasks: [], photos: [
      { ...base, id: 'a', uri: 'app-photo:abc123.jpg' },
      { ...base, id: 'b', uri: 'idb:abc123' },
      { ...base, id: 'c', uri: 'data:image/jpeg;base64,AAAA' },
      { ...base, id: 'd', uri: 'javascript:alert(1)' },
      { ...base, id: 'e', uri: 'data:image/svg+xml;base64,AAAA' },
      { ...base, id: 'f', uri: 'https://evil.example/x.jpg' },
      { ...base, id: 'g', uri: 'data:image/jpeg;base64,AA" onerror="x' },
    ] }] }]);
    expect(out[0].rooms[0].photos.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
