import { buildEstimate } from '@/engine/estimator';
import { defaultAnswers, jobType } from '@/engine/jobTypes';
import { projectFromEstimate } from '@/engine/site';
import { emptyContract } from '@/engine/contract';
import { emptyMoney } from '@/engine/books';
import { TERMS_VERSION } from '@/engine/legal';
import { DEFAULT_SCHEDULE } from '@/store/sanitize';
import { writeFileSync } from 'node:fs';

const today = new Date();
const day = (off: number) => { const d = new Date(today); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };
let n = 0; const nid = () => `id${++n}`;
const profile: any = { companyName: 'Upgrade Home', contactName: 'Minh Nguyen', phone: '(253) 555-0142', email: 'minh@example.com', license: 'UPGRAH*123AB', specialties: ['bathroom', 'kitchen', 'basement'], markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4, quoteValidDays: 30, quoteLanguage: 'en', schedule: DEFAULT_SCHEDULE, about: '' };
const mk = (jobTypeId: string, title: string, client: string, address: string, status: string, off: number) => {
  const jt = jobType(jobTypeId as any);
  const input: any = { jobTypeId, mode: jt.detailed ? 'detailed' : 'quick', finish: 'mid', answers: defaultAnswers(jobTypeId as any), customItems: [], markupPct: 20, minMarkupPct: 15, salesTaxPct: 10.4, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [] };
  const r: any = buildEstimate(input);
  return { id: nid(), createdAt: new Date(day(off)).toISOString(), updatedAt: new Date(day(off + 1)).toISOString(), status, mode: input.mode, jobTypeId, title, clientName: client, address, description: '', scopeNote: '', photos: [], finish: 'mid', answers: input.answers, customItems: [], markupPct: 20, salesTaxPct: 10.4, ...r };
};
const jts = ['bathroom', 'kitchen', 'basement', 'deck', 'roof', 'flooring', 'painting'];
const ok = (id: string) => { try { jobType(id as any); return true; } catch { return false; } };
const pick = (i: number) => { const c = jts.filter(ok); return c[i % c.length]; };
const estimates = [
  mk(pick(0), 'Hall bath, tiled shower', 'Linh Tran', '2148 Alder Ridge Ln, Seattle', 'won', -30),
  mk(pick(1), 'Kitchen remodel', 'David Kim', '5810 Harbor Vine St, Tacoma', 'won', -22),
  mk(pick(2), 'Basement finish', 'Sarah Olsen', '9034 Juniper Hollow Dr, Seattle', 'won', -60),
  mk(pick(0), 'Primary bath refresh', 'Hoa Pham', '1177 Larkspur Bend, Seattle', 'sent', -5),
  mk(pick(3), 'Back deck rebuild', 'Mark Jensen', '36 Quarry Fern Ct, Kent', 'sent', -9),
  mk(pick(1), 'Kitchen, new cabinets', 'An Vo', '742 Willow Crest Ave, Burien', 'draft', -1),
  mk(pick(4), 'Roof replacement', 'Tom Baker', '605 Tamarack Ln, Seattle', 'draft', -2),
];
const codes: string[] = [];
const projects: any[] = []; const contracts: any[] = [];
estimates.filter((e) => e.status === 'won').forEach((e, i) => {
  const p: any = projectFromEstimate(e as any, e.title, nid(), nid, codes); codes.push(p.code);
  p.createdAt = e.createdAt; if (i === 2) p.status = 'done';
  const c = (k: string, vendor: string, amt: number, off: number) => ({ id: nid(), date: day(off), kind: k, vendor, note: '', amount: amt, createdAt: day(off) });
  p.money = { ...emptyMoney(), costs: [c('materials', 'The Home Depot', Math.round(e.materialTotal * 0.55), -14 - i), c('labor', 'Crew', Math.round(e.laborTotal * 0.6), -10 - i), c('subs', 'Rainier Plumbing', Math.round(e.price * 0.08), -8), c('materials', "Lowe's", Math.round(e.materialTotal * 0.2), -4)] };
  p.rooms[0].tasks = ['Demo and haul away', 'Rough plumbing', 'Waterproof shower pan', 'Tile walls', 'Set vanity and toilet'].map((text, j) => ({ id: nid(), text, done: j < 2 + i }));
  projects.push(p);
  const ct: any = emptyContract(e.id);
  ct.accepted = { name: e.clientName, strokes: [[10, 20, 60, 40, 120, 18, 160, 44]], w: 300, h: 100, signedAt: new Date(day(-20 - i)).toISOString(), total: e.total };
  const dep = Math.round(e.price * 0.1 * 100) / 100;
  ct.invoices = [{ id: nid(), number: 1001 + i, date: day(-20 - i), dueDate: day(-13 - i), itemKey: 'm0', label: 'Deposit at signing', amount: dep, tax: Math.round(dep * 10.4) / 100 }];
  if (i !== 1) ct.payments = [{ id: nid(), date: day(-18 - i), amount: Math.round(dep * 1.104 * 100) / 100, method: 'check', invoiceId: ct.invoices[0].id }];
  contracts.push(ct);
});
const ev = (title: string, kind: string, off: number, time: string, address: string, extra: any = {}) => ({ id: nid(), title, kind, date: day(off), time, durationMin: 60, address, notes: '', remindMin: 30, done: false, createdAt: new Date().toISOString(), ...extra });
const team = [
  { id: 't1', name: 'Luis Ortega', role: 'crew', trade: 'Tile', phone: '(206) 555-0101', rate: 320, rateUnit: 'day', lang: 'es', active: true },
  { id: 't2', name: 'Tuan Le', role: 'crew', trade: 'Carpentry', phone: '(206) 555-0102', rate: 300, rateUnit: 'day', lang: 'vi', active: true },
  { id: 't3', name: 'Rainier Plumbing', role: 'sub', trade: 'Plumbing', phone: '(206) 555-0103', rate: 0, rateUnit: 'day', lang: 'en', active: true },
];
const KIND = process.env.KINDS!.split(',');
const events = [
  ev('Site visit: Primary bath refresh', KIND[0], 0, '10:00', '1177 Larkspur Bend, Seattle'),
  ev('Crew day: Hall bath', KIND[1] ?? KIND[0], 0, '08:00', '2148 Alder Ridge Ln, Seattle', { projectId: projects[0].id, crew: ['t1', 't2'], durationMin: 480 }),
  ev('Inspection: rough plumbing', KIND[3] ?? KIND[0], 1, '13:30', '5810 Harbor Vine St, Tacoma', { projectId: projects[1].id }),
  ev('Call An Vo about cabinets', KIND[2] ?? KIND[0], 2, '09:15', ''),
  ev('Crew day: Kitchen remodel', KIND[1] ?? KIND[0], 3, '08:00', '5810 Harbor Vine St, Tacoma', { projectId: projects[1].id, crew: ['t2'], durationMin: 480 }),
  ev('Site visit: Roof replacement', KIND[0], 5, '15:00', '605 Tamarack Ln, Seattle'),
];
const inbox = [
  { id: nid(), kind: 'email', vendor: 'The Home Depot', date: day(-1), total: 412.37, tax: 38.85, costKind: 'materials', lines: [{ name: '1/2 in. cement board 3x5', qty: 12, unit: 'EA', total: 167.76 }, { name: 'Thinset mortar 50 lb', qty: 4, unit: 'EA', total: 87.92 }], status: 'new' },
  { id: nid(), kind: 'photo', vendor: "Lowe's", date: day(-2), total: 89.12, tax: 8.4, costKind: 'materials', lines: [], status: 'new' },
];
const data = { profile, presets: {}, priceBook: { labor: {}, materials: {} }, pastJobs: [], estimates, customTypes: [], customQuestions: {}, projects, contracts, events, team, inbox, lastInvoiceNo: 1003, consent: { version: TERMS_VERSION, at: new Date().toISOString(), ai: true } };
writeFileSync(process.argv[2], JSON.stringify(data));
console.log('seeded', estimates.map((e) => `${e.jobTypeId}:${Math.round(e.total)}`).join(' '));
