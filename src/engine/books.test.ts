import { describe, expect, it } from 'vitest';

import { sanitizeMoney, sanitizePersisted } from '../store/sanitize';
import {
  applyReceiptToBuy, buyListFromEstimate, emptyMoney, lessonsContext, lessonsFromReceipt, matchReceipt, nameMatch, parseReceipt, priceDrift,
  projectBooks, type BuyItem, type ProjectMoney,
} from './books';
import { emptyContract, type Contract } from './contract';
import { confirmations, followUpText, newPlan, nextFollowUp, parseDays, planProblems, stopPlan } from './followup';
import { consentCurrent, missingRequired, TERMS_VERSION } from './legal';
import type { CalEvent } from './schedule';
import { confirmText, laborCost, morningCheck, movedEvent, needsCheck, type TeamMember } from './team';
import type { Estimate, Profile } from './types';

const profile = {
  companyName: 'Upgrade Home', contactName: 'Minh', phone: '', email: '', license: '', specialties: [],
  markupPct: 20, minMarkupPct: 15, salesTaxPct: 10, quoteValidDays: 30, quoteLanguage: 'en', about: '',
  schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Rough-in', pct: 50 }, { label: 'Final', pct: 40 }],
} as Profile;

const est = {
  id: 'e1', title: 'Hall bath', clientName: 'Mrs Kim', address: '12 Main', price: 20000, tax: 2000, total: 22000, salesTaxPct: 10,
  cost: 15000, laborTotal: 9000, materialTotal: 6000, status: 'won', updatedAt: '2026-11-01T10:00:00Z', finish: 'mid',
  lines: [], trades: [], extras: [], checks: [], jobTypeId: 'bathroom',
  materials: [
    { materialId: 'm1', name: 'LVP flooring', category: 'flooring', rawQty: 190, qty: 200, unit: 'SF', unitPrice: 3.1, total: 620 },
    { materialId: 'm2', name: 'Thinset mortar 50 lb', category: 'tile', rawQty: 3, qty: 4, unit: 'bag', unitPrice: 25, total: 100 },
    { materialId: 'm3', name: 'Nothing', category: 'tile', rawQty: 0, qty: 0, unit: 'EA', unitPrice: 1, total: 0 },
  ],
} as unknown as Estimate;

const contract = (): Contract => ({
  ...emptyContract('e1'),
  changeOrders: [{ id: 'c1', number: 1, title: 'Niche', description: '', amount: 1000, status: 'approved', createdAt: '2026-11-03T00:00:00Z' }],
  invoices: [
    { id: 'i1', number: 1001, date: '2026-10-01', dueDate: '2026-10-10', itemKey: 'm0', label: 'Deposit', amount: 2000, tax: 200 },
    { id: 'i2', number: 1002, date: '2026-10-20', dueDate: '2026-10-30', itemKey: 'm1', label: 'Rough-in', amount: 10000, tax: 1000 },
  ],
  payments: [{ id: 'p1', date: '2026-10-05', amount: 2200, method: 'check', note: '' }],
});

const money = (over: Partial<ProjectMoney> = {}): ProjectMoney => ({
  ...emptyMoney(),
  costs: [
    { id: 'a', date: '2026-10-02', kind: 'labor', vendor: 'Tuan', note: '', amount: 4000, createdAt: '' },
    { id: 'b', date: '2026-10-03', kind: 'materials', vendor: 'Home Depot', note: '', amount: 1500.55, createdAt: '' },
    { id: 'c', date: '2026-10-04', kind: 'subs', vendor: 'Plumber', note: '', amount: 1200, createdAt: '' },
    { id: 'd', date: '2026-10-04', kind: 'equipment', vendor: 'Rental', note: '', amount: 99.45, createdAt: '', ownerOwes: { due: '2026-10-20' } },
  ],
  ...over,
});

describe('project dashboard (the template)', () => {
  const b = projectBooks({ est, profile, contract: contract(), money: money(), today: '2026-11-04' });

  it('contract price = base bid + approved change orders (before tax)', () => {
    expect(b.contract).toEqual({ base: 20000, changes: 1000, price: 21000 });
  });

  it('adds costs by kind', () => {
    expect(b.cost).toMatchObject({ labor: 4000, materials: 1500.55, subs: 1200, equipment: 99.45, total: 6800 });
  });

  it('profit and margin', () => {
    expect(b.profit).toEqual({ amount: 14200, marginPct: 67.6 });
  });

  it('owner funds: deposited minus spent; asks for a deposit when negative', () => {
    expect(b.funds).toEqual({ deposited: 2200, spent: 6800, spendable: -4600, status: 'request' });
  });

  it('owner reimbursement and overdue items (unpaid invoice + unpaid reimbursable cost past due)', () => {
    expect(b.owner.owes).toBe(13299.45);
    expect(b.owner.received).toBe(2200);
    expect(b.owner.balance).toBe(11099.45);
    expect(b.owner.overdueCount).toBe(2);
    expect(b.owner.overdueAmount).toBe(11099.45);
  });

  it('taxes: sales tax on the contract price, income tax on profit, net after tax', () => {
    expect(b.tax).toEqual({ salesPct: 10, sales: 2100, incomePct: 30, income: 4260, reserve: 6360, netAfterTax: 9940, netMarginPct: 47.3 });
  });

  it('uses the job-site tax rate when set, and never taxes a loss', () => {
    const loss = projectBooks({ est, profile, contract: contract(), money: money({ salesTaxPct: 10.35, costs: [{ id: 'x', date: '2026-10-01', kind: 'labor', vendor: '', note: '', amount: 30000, createdAt: '' }] }), today: '2026-11-04' });
    expect(loss.tax.sales).toBe(2173.5);
    expect(loss.tax.income).toBe(0);
    expect(loss.profit.amount).toBe(-9000);
  });

  it('flags kinds more than 5% over budget', () => {
    const over = projectBooks({ est, profile, contract: contract(), money: money({ costs: [{ id: 'x', date: '2026-10-01', kind: 'labor', vendor: '', note: '', amount: 10530, createdAt: '' }] }), today: '2026-11-04' });
    expect(over.over).toEqual([{ kind: 'labor', pct: 17, amount: 1530 }]);
    const ok = projectBooks({ est, profile, contract: contract(), money: money({ costs: [{ id: 'x', date: '2026-10-01', kind: 'labor', vendor: '', note: '', amount: 9400, createdAt: '' }] }), today: '2026-11-04' });
    expect(ok.over).toEqual([]);
  });

  it('works for a job site with no estimate', () => {
    const none = projectBooks({ money: emptyMoney(), today: '2026-11-04' });
    expect(none.contract.price).toBe(0);
    expect(none.funds.status).toBe('none');
    expect(none.profit.marginPct).toBe(0);
  });

  it('funds are low when less than 15% of the cost still to spend is on hand', () => {
    const c = { ...contract(), payments: [{ id: 'p', date: '2026-10-05', amount: 7000, method: 'check' as const, note: '' }] };
    const low = projectBooks({ est, profile, contract: c, money: money(), today: '2026-11-04' });
    expect(low.funds.spendable).toBe(200);
    expect(low.funds.status).toBe('low');
  });
});

describe('buy list, receipts and price lessons', () => {
  let n = 0;
  const id = () => `id${++n}`;
  const buy = buyListFromEstimate(est, id);

  it('makes the buy list from the estimate materials (skips zero quantities)', () => {
    expect(buy.map((b) => [b.name, b.qty, b.unit, b.estCost])).toEqual([['LVP flooring', 200, 'SF', 620], ['Thinset mortar 50 lb', 4, 'bag', 100]]);
  });

  const reply = 'Here you go: {"vendor":"Home Depot","date":"2026-11-02","tax":"$7.20","total":"$803.20","kind":"materials","lines":[{"name":"LVP Flooring Oak","qty":200,"unit":"SF","total":696},{"name":"Thinset Mortar 50 lb","qty":4,"unit":"bag","total":100},{"name":"Gum","qty":1,"unit":"","total":0},{"name":"","total":5}]}';

  it('reads the AI reply and keeps sane values', () => {
    const r = parseReceipt(reply);
    expect(r.vendor).toBe('Home Depot');
    expect(r.date).toBe('2026-11-02');
    expect(r.tax).toBe(7.2);
    expect(r.total).toBe(803.2);
    expect(r.lines).toHaveLength(3);
  });

  it('rejects unreadable replies with a message the contractor can act on', () => {
    expect(() => parseReceipt('sorry')).toThrow(/sharper photo/);
    expect(() => parseReceipt('{"lines":[]}')).toThrow(/total/);
  });

  it('matches receipt lines to buy list items by name', () => {
    expect(nameMatch('LVP Flooring Oak', 'LVP flooring')).toBe(1);
    expect(nameMatch('Gum', 'LVP flooring')).toBe(0);
    const m = matchReceipt(parseReceipt(reply).lines, buy);
    expect(m.map((l) => l.buyId)).toEqual([buy[0].id, buy[1].id, undefined]);
    const after = applyReceiptToBuy(buy, m);
    expect(after.map((b) => [b.bought, b.spent])).toEqual([[true, 696], [true, 100]]);
  });

  it('learns real prices and reports drift from the estimate', () => {
    const m = matchReceipt(parseReceipt(reply).lines, buy);
    const ls = lessonsFromReceipt(m, buy, { at: '2026-11-02', vendor: 'Home Depot', projectId: 'p1' }, id);
    expect(ls.map((l) => [l.item, l.quoted, l.paid])).toEqual([['LVP flooring', 3.1, 3.48], ['Thinset mortar 50 lb', 25, 25]]);
    const d = priceDrift(ls);
    expect(d).toEqual([{ item: 'LVP flooring', unit: 'SF', quoted: 3.1, paid: 3.48, changePct: 12, receipts: 1 }]);
    expect(lessonsContext(ls)).toContain('LVP flooring $3.48/SF');
    expect(lessonsContext([])).toBe('');
  });

  it('skips lessons when units differ', () => {
    const b: BuyItem[] = [{ id: 'b1', name: 'Drywall', qty: 10, unit: 'sheet', estCost: 165, bought: false, source: 'estimate' }];
    expect(lessonsFromReceipt([{ name: 'Drywall', qty: 1, unit: 'pallet', total: 500, buyId: 'b1' }], b, { at: '2026-11-01', vendor: '', projectId: 'p' }, id)).toEqual([]);
  });

  it('cleans saved money data', () => {
    const m = sanitizeMoney({ salesTaxPct: 99, incomeTaxPct: 30, costs: [{ id: 'a', date: 'bad', kind: 'labor', amount: 1 }, { id: 'b', date: '2026-10-01', kind: 'nope', amount: 12.345, ownerOwes: { due: '2026-11-01', paidOn: 'x' } }], buy: [{ id: 'x', name: 'Tile', qty: -1, estCost: 10 }] });
    expect(m.salesTaxPct).toBeNull();
    expect(m.costs).toHaveLength(1);
    expect(m.costs[0]).toMatchObject({ kind: 'materials', amount: 12.35, ownerOwes: { due: '2026-11-01' } });
    expect(m.buy[0]).toMatchObject({ qty: 0, estCost: 10, bought: false });
  });
});

describe('follow-ups need the client’s permission and a schedule', () => {
  const base = { ...newPlan('e1', '2026-11-01'), phone: '253-555-0100', email: 'kim@example.com' };

  it('blocks turning on without consent, channel, contact and days', () => {
    expect(planProblems(newPlan('e1', '2026-11-01'))).toEqual(['The client has to agree to follow-ups first.', 'Pick text, email, or both.', 'Set when to follow up (required).']);
    expect(planProblems({ ...base, consent: 'agreed', channels: ['text', 'email'], days: [2, 5] })).toEqual([]);
    expect(planProblems({ ...base, phone: '12', consent: 'agreed', channels: ['text'], days: [2] })).toEqual(['Add the client’s mobile number.']);
  });

  it('parses a typed schedule', () => {
    expect(parseDays('5, 2,2 , 10 99 0')).toEqual([2, 5, 10]);
  });

  it('gives the next follow-up date and stops when signed, declined or STOP', () => {
    const p = { ...base, consent: 'agreed' as const, channels: ['text' as const], days: [2, 5, 10], sent: [{ day: 2, at: '', channel: 'text' as const }] };
    expect(nextFollowUp(p, 'sent')).toEqual({ day: 5, date: '2026-11-06' });
    expect(nextFollowUp(p, 'won')).toBeNull();
    expect(nextFollowUp(stopPlan(p, 'stop', 'now'), 'sent')).toBeNull();
    expect(stopPlan(p, 'declined', 'now').consent).toBe('declined');
    expect(nextFollowUp({ ...p, consent: 'not-asked' }, 'sent')).toBeNull();
  });

  it('writes confirmations for both sides and messages with a way out', () => {
    const c = confirmations({ ...base, consent: 'agreed', channels: ['text'], days: [2, 5] }, 'Upgrade Home', 'Jenny Kim', 'Hall bath');
    expect(c.client).toContain('Reply STOP');
    expect(c.contractor).toContain('Jenny Kim agreed');
    expect(followUpText(1, 'Upgrade Home', 'Jenny Kim', 'Hall bath')).toMatch(/^Hi Jenny,.*Reply STOP to opt out\.$/);
  });
});

describe('crew check-in', () => {
  const tuan: TeamMember = { id: 't', name: 'Tuan Le', role: 'crew', trade: 'Tile', phone: '', rate: 320, rateUnit: 'day', lang: 'vi', active: true };
  const ana: TeamMember = { ...tuan, id: 'a', name: 'Ana', rate: 45, rateUnit: 'hour', lang: 'es' };
  const ev: CalEvent = { id: 'e', title: 'Crew day', kind: 'crew', date: '2026-11-04', time: '07:30', durationMin: 480, address: '12 Main', notes: '', remindMin: null, done: false, createdAt: '', crew: ['t', 'a'], attend: { a: { state: 'coming', at: '' } } };

  it('lists who is booked today', () => {
    const list = morningCheck([ev, { ...ev, id: 'x', date: '2026-11-05' }], [tuan, ana], '2026-11-04');
    expect(list.map((x) => [x.member.name, needsCheck(x.attendance)])).toEqual([['Tuan Le', true], ['Ana', false]]);
  });

  it('labor cost from day or hour rates', () => {
    expect(laborCost(tuan, ev)).toBe(320);
    expect(laborCost(ana, ev)).toBe(360);
    expect(laborCost({ ...tuan, rate: 0 }, ev)).toBe(0);
  });

  it('confirmation text in the worker’s language', () => {
    expect(confirmText(tuan, ev, 'Kim bath')).toMatch(/^Chào Tuan/);
    expect(confirmText(ana, ev, 'Kim bath')).toMatch(/^Hola Ana/);
  });

  it('a rescheduled day is a new booking for that person only', () => {
    const m = movedEvent(ev, 't', '2026-11-06', 'n', 'now');
    expect(m).toMatchObject({ id: 'n', date: '2026-11-06', crew: ['t'], attend: {}, done: false });
  });
});

describe('terms gate', () => {
  it('requires every required box; AI sharing is optional', () => {
    expect(missingRequired({ adult: true, 'ai-wrong': true, 'my-duty': true, terms: true })).toEqual([]);
    expect(missingRequired({ adult: true })).toEqual(['ai-wrong', 'my-duty', 'terms']);
  });

  it('asks again when the Terms version changes, and survives a backup round trip', () => {
    expect(consentCurrent({ version: TERMS_VERSION, at: '', ai: false })).toBe(true);
    expect(consentCurrent({ version: '2020-01-01', at: '', ai: true })).toBe(false);
    const d = sanitizePersisted({ consent: { version: TERMS_VERSION, at: 'x', ai: 'yes' }, team: [{ id: 't', name: 'Tuan', rate: -5, rateUnit: 'week' }], followups: [{ estimateId: 'e', startDate: '2026-11-01', consent: 'agreed', channels: ['text', 'fax'], days: [2, 99] }] }).data;
    expect(d.consent).toEqual({ version: TERMS_VERSION, at: 'x', ai: false });
    expect(d.team?.[0]).toMatchObject({ rate: 0, rateUnit: 'day', role: 'crew' });
    expect(d.followups?.[0]).toMatchObject({ channels: ['text'], days: [2] });
  });
});

describe('Bidwell daily check-in', () => {
  it('asks about crew, follow-ups due, money, stale photo updates and unasked quotes', async () => {
    const { dailyCheckIn } = await import('./pm');
    const team: TeamMember[] = [{ id: 't', name: 'Tuan', role: 'crew', trade: 'Tile', phone: '', rate: 300, rateUnit: 'day', lang: 'en', active: true }];
    const ev: CalEvent = { id: 'e', title: 'Crew day', kind: 'crew', date: '2026-11-04', time: '07:30', durationMin: 480, address: '', notes: '', remindMin: null, done: false, createdAt: '', crew: ['t'], projectId: 'p1' };
    const project = { id: 'p1', estimateId: 'e1', title: 'Kim bath', clientName: 'Kim', address: '', status: 'active' as const, createdAt: '2026-10-20T00:00:00Z', rooms: [], logs: [], money: money() };
    const sentEst = { ...est, id: 'e2', title: 'Patel kitchen', clientName: 'Raj', status: 'sent', updatedAt: '2026-10-30T00:00:00Z' } as Estimate;
    const follow = { ...newPlan('e3', '2026-11-01'), consent: 'agreed' as const, channels: ['email' as const], email: 'a@b.co', days: [3] };
    const followEst = { ...sentEst, id: 'e3', title: 'Deck', clientName: 'Lopez' } as Estimate;
    const items = dailyCheckIn({ projects: [project], estimates: [est, sentEst, followEst], contracts: [contract()], profile, events: [ev], team, followups: [follow], today: '2026-11-04' });
    const ids = items.map((i) => i.id);
    expect(ids[0]).toBe('crew-e-t');
    expect(ids).toEqual(expect.arrayContaining(['follow-e3', 'funds-p1', 'overdue-p1', 'photos-p1', 'ask-e2']));
    expect(ids).not.toContain('ask-e3');
    expect(items.length).toBeLessThanOrEqual(8);
  });
});
