import { describe, expect, it } from 'vitest';

import { sanitizeContracts, sanitizeEvents } from '../store/sanitize';
import {
  acceptedBlock, billItems, changedSinceSigned, changeOrderHtml, contractTotals, emptyContract, hasInk, invoiceHtml, invoiceStates,
  nextChangeNo, nextInvoiceNo, signatureSvg, termsFrom, type Contract,
} from './contract';
import { buildEstimate } from './estimator';
import { defaultAnswers } from './jobTypes';
import { quoteHtml } from './quote';
import { addDays, eventIcs, eventsOn, reminderAt, startOf, timeLabel, upcoming, type CalEvent } from './schedule';
import type { Estimate, Profile } from './types';

const profile = {
  companyName: 'Upgrade Home', contactName: 'Minh', phone: '253-555-0100', email: 'a@b.co', license: 'UPGRAHL123', specialties: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, quoteValidDays: 30, quoteLanguage: 'en', about: '',
  schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Rough-in', pct: 50 }, { label: 'Final', pct: 40 }],
} as Profile;

const est = {
  id: 'e1', title: 'Hall bath', clientName: 'Mrs Kim', address: '12 Main', price: 20000, tax: 2000, total: 22000, salesTaxPct: 10,
  status: 'won', updatedAt: '2026-11-01T10:00:00Z', finish: 'mid', lines: [], trades: [], extras: [], checks: [], jobTypeId: 'bathroom',
} as unknown as Estimate;

const sig = { name: 'Jane Kim', strokes: [[10, 10, 40, 30, 80, 20, 120, 40, 160, 30, 200, 50, 220, 20]], w: 300, h: 170, signedAt: '2026-11-02T18:00:00Z' };

const contract = (): Contract => ({
  ...emptyContract('e1'),
  accepted: { ...sig, total: 22000 },
  changeOrders: [
    { id: 'c1', number: 1, title: 'Add niche', description: 'Tile niche in shower', amount: 600, status: 'approved', createdAt: '2026-11-03T00:00:00Z', signature: sig },
    { id: 'c2', number: 2, title: 'Heated floor', description: '', amount: 1800, status: 'pending', createdAt: '2026-11-03T00:00:00Z' },
    { id: 'c3', number: 3, title: 'Remove closet', description: '', amount: -400, status: 'approved', createdAt: '2026-11-03T00:00:00Z' },
  ],
});

describe('contract money', () => {
  it('adds approved change orders (and credits) with tax, ignores pending ones', () => {
    const t = contractTotals(est, profile, contract());
    expect(t.changes).toBe(200);
    expect(t.total).toBe(22220);
    expect(t.pending).toBe(1);
    expect(t.balance).toBe(22220);
  });
  it('bills the payment schedule then each approved change order, with tax on each', () => {
    const items = billItems(est, profile, contract());
    expect(items.map((i) => i.key)).toEqual(['m0', 'm1', 'm2', 'co:c1', 'co:c3']);
    expect(items.map((i) => i.amount)).toEqual([2000, 10000, 8000, 600, -400]);
    expect(items[0].tax).toBe(200);
    // Everything billed adds up to the contract total exactly.
    expect(items.reduce((s, i) => s + i.amount + i.tax, 0)).toBeCloseTo(contractTotals(est, profile, contract()).total, 2);
    expect(items.filter((i) => i.credit).map((i) => i.key)).toEqual(['co:c3']);
  });
  it('applies payments to invoices oldest first and spots overdue ones', () => {
    const c = contract();
    c.invoices = [
      { id: 'i1', number: 1001, date: '2026-11-01', dueDate: '2026-11-08', itemKey: 'm0', label: 'Deposit', amount: 2000, tax: 200 },
      { id: 'i2', number: 1002, date: '2026-11-10', dueDate: '2026-11-12', itemKey: 'm1', label: 'Rough-in', amount: 10000, tax: 1000 },
    ];
    c.payments = [{ id: 'p1', date: '2026-11-02', amount: 5000, method: 'check', note: '' }];
    // $5,000 paid plus the $440 credit (work removed, with tax) count toward the invoices.
    const st = invoiceStates(c, '2026-11-20', 10);
    expect(st.i1).toEqual({ state: 'paid', paid: 2200 });
    expect(st.i2).toEqual({ state: 'partial', paid: 3240 });
    expect(invoiceStates({ ...c, payments: [], changeOrders: [] }, '2026-11-20', 10).i2.state).toBe('overdue');
    expect(contractTotals(est, profile, c).due).toBe(7760);
    expect(nextInvoiceNo([c, emptyContract('x')])).toBe(1003);
    expect(nextInvoiceNo([c], 1010)).toBe(1011); // a deleted job's numbers are never reused
    expect(nextChangeNo(c)).toBe(4);
  });
  it('keeps the signed terms when the estimate or the schedule in Settings changes later', () => {
    const c = { ...contract(), terms: termsFrom(est, profile) };
    const edited = { ...est, price: 25000, tax: 2500, total: 27500 };
    const newSchedule = { ...profile, schedule: [{ label: 'Demo', pct: 20 }, { label: 'Rest', pct: 80 }] };
    expect(contractTotals(edited, newSchedule, c).total).toBe(22220);
    expect(billItems(edited, newSchedule, c).map((i) => i.label)[1]).toBe('Rough-in (50%)');
  });
  it('balance is exactly zero when every invoice is paid (no stray cents)', () => {
    const odd = { ...est, price: 2010, tax: 206.03, total: 2216.03, salesTaxPct: 10.25 };
    const two = { ...profile, schedule: [{ label: 'A', pct: 50 }, { label: 'B', pct: 50 }] };
    const items = billItems(odd, two, emptyContract('e1'));
    const t = contractTotals(odd, two, { ...emptyContract('e1'), payments: [{ id: 'p', date: '2026-11-01', amount: items.reduce((s, i) => s + i.amount + i.tax, 0), method: 'cash', note: '' }] });
    expect(t.balance).toBe(0);
  });
  it('notices when the quote changed after it was signed', () => {
    expect(changedSinceSigned(est, contract())).toBe(false);
    expect(changedSinceSigned({ ...est, total: 23000 }, contract())).toBe(true);
    expect(changedSinceSigned(est, emptyContract('e1'))).toBe(false);
  });
});

describe('signatures and documents', () => {
  it('draws a signature as smooth lines and needs real ink', () => {
    const svg = signatureSvg(sig);
    expect(svg).toContain('<path d="M10.0 10.0');
    expect(svg).not.toContain('NaN');
    expect(hasInk(sig.strokes)).toBe(false); // 7 points: a scribble, not a signature
    expect(hasInk([[...sig.strokes[0], ...sig.strokes[0]]])).toBe(true);
  });
  it('invoice: what is due now and the whole contract picture, client-safe', () => {
    const c = contract();
    const inv = { id: 'i1', number: 1001, date: '2026-11-01', dueDate: '2026-11-08', itemKey: 'm0', label: 'Deposit (10%)', amount: 2000, tax: 200 };
    c.invoices = [inv];
    const html = invoiceHtml(est, profile, c, inv, 'en');
    expect(html).toContain('Invoice');
    expect(html).toContain('$2,200.00');
    expect(html).toContain('$22,220.00');
    expect(html).not.toMatch(/markup|labor|cost/i);
    expect(invoiceHtml({ ...est, clientName: '<b>x</b>' }, profile, c, inv, 'vi')).toContain('&lt;b&gt;x');
  });
  it('change order PDF shows the new total and the client signature', () => {
    const c = contract();
    const html = changeOrderHtml(est, profile, c, c.changeOrders[1], 'en');
    expect(html).toContain('Heated floor');
    // 20000 + 600 - 400 (approved) + 1800 (this one) = 22000, plus 10% tax
    expect(html).toContain('$24,200.00');
    expect(changeOrderHtml(est, profile, c, c.changeOrders[0], 'en')).toContain('Jane Kim');
  });
  it('signed quote replaces the blank signature lines', () => {
    const built = buildEstimate({ jobTypeId: 'bathroom', mode: 'detailed', finish: 'mid', answers: defaultAnswers('bathroom'), customItems: [],
      markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, priceBook: { labor: {}, materials: {} }, presets: {}, pastJobs: [] });
    const real = { ...est, ...built, answers: defaultAnswers('bathroom'), customItems: [], photos: [], description: '', scopeNote: '', mode: 'detailed' } as unknown as Estimate;
    const html = quoteHtml(real, profile, 'en', acceptedBlock({ ...sig, total: real.total }, profile, 'en'));
    expect(html).toContain('Accepted: <b>Jane Kim</b>');
    expect(html).not.toContain('>Owner<');
    expect(quoteHtml(real, profile, 'en')).not.toContain('Accepted:');
  });
});

describe('saved contracts', () => {
  it('drops broken signatures, amounts and duplicates', () => {
    const out = sanitizeContracts([
      { estimateId: 'e1', accepted: { ...sig, total: 22000 }, changeOrders: [{ id: 'a', number: 1, title: 'X', amount: 'lots' }, { id: 'b', number: 2, title: 'Y', amount: 50, status: 'weird' }],
        invoices: [{ id: 'i', number: 1001, date: 'today', dueDate: '2026-11-01', amount: 1, tax: 0 }], payments: [{ id: 'p', date: '2026-11-01', amount: -5 }, { id: 'q', date: '2026-11-01', amount: 5, method: 'bitcoin' }] },
      { estimateId: 'e1' },
      { estimateId: 'e2', accepted: { name: 'x', strokes: [[1, 'a']], w: 10, h: 10, total: 5 } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].accepted?.name).toBe('Jane Kim');
    expect(out[0].changeOrders).toEqual([expect.objectContaining({ id: 'b', status: 'pending', amount: 50 })]);
    expect(out[0].invoices).toEqual([]);
    expect(out[0].payments).toEqual([{ id: 'q', date: '2026-11-01', amount: 5, method: 'other', note: '' }]);
    expect(out[1].accepted).toBeUndefined();
  });
});

describe('schedule', () => {
  const ev = (over: Partial<CalEvent>): CalEvent => ({
    id: 'x', title: 'Visit', kind: 'visit', date: '2026-11-05', time: '09:30', durationMin: 60, address: '', notes: '', remindMin: 60, done: false, createdAt: '', ...over,
  });
  it('works out days, times and reminders in local time', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // across a clock change
    expect(startOf(ev({})).getHours()).toBe(9);
    expect(startOf(ev({ time: '' })).getHours()).toBe(7);
    expect(timeLabel(ev({}))).toBe('9:30 AM – 10:30 AM');
    expect(timeLabel(ev({ time: '13:00', durationMin: 0 }))).toBe('1:00 PM');
    expect(timeLabel(ev({ time: '' }))).toBe('All day');
    const now = new Date(2026, 10, 1, 8, 0);
    expect(reminderAt(ev({}), now)?.getHours()).toBe(8);
    expect(reminderAt(ev({ remindMin: null }), now)).toBeNull();
    expect(reminderAt(ev({ date: '2026-10-01' }), now)).toBeNull(); // already past
  });
  it('lists a day in time order and what is coming up', () => {
    const list = [ev({ id: 'b', time: '14:00' }), ev({ id: 'a', time: '08:00' }), ev({ id: 'c', date: '2026-11-20' }), ev({ id: 'd', date: '2026-11-06', done: true })];
    expect(eventsOn(list, '2026-11-05').map((e) => e.id)).toEqual(['a', 'b']);
    expect(upcoming(list, '2026-11-04', 7).map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('makes a calendar file and cleans saved events', () => {
    const ics = eventIcs(ev({ title: 'Walk, tile; layout', address: '12 Main' }), 'Upgrade Home');
    expect(ics).toContain('SUMMARY:Walk\\, tile\\; layout');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(eventIcs(ev({ time: '' }), '')).toContain('DTSTART;VALUE=DATE:20261105');
    const saved = sanitizeEvents([ev({}), ev({}), { id: 'z', date: 'bad' }, { ...ev({ id: 'y' }), time: '25:00', kind: 'party', remindMin: -3 }]);
    expect(saved.map((e) => e.id)).toEqual(['x', 'y']);
    expect(saved[1]).toMatchObject({ time: '', kind: 'other', remindMin: null });
  });
});
