import { describe, expect, it } from 'vitest';

import { emptyMoney, type CostEntry } from './books';
import { emptyContract } from './contract';
import { periodRange, sheetCsv, sheetRows } from './sheet';
import type { SiteProject } from './site';
import type { Estimate } from './types';

const cost = (id: string, kind: CostEntry['kind'], amount: number, date: string, more: Partial<CostEntry> = {}): CostEntry => ({ id, date, kind, vendor: '', note: '', amount, createdAt: date, ...more });
const proj = (id: string, title: string, costs: CostEntry[], over: Partial<SiteProject> = {}): SiteProject => ({
  id, title, clientName: '', address: '', status: 'active', createdAt: '2026-10-01', rooms: [], logs: [], estimateId: `e-${id}`, money: { ...emptyMoney(), costs }, ...over,
});
const est = (id: string, price: number) => ({ id: `e-${id}`, price, cost: 0, laborTotal: 0, materialTotal: 0, salesTaxPct: 10, status: 'won' } as unknown as Estimate);
const base = { profile: null, today: '2026-11-22' };

describe('the money sheet', () => {
  const projects = [
    proj('a', 'Kim remodel', [cost('1', 'materials', 1000, '2026-11-05'), cost('2', 'labor', 2500, '2026-11-06'), cost('3', 'subs', 500, '2026-10-20'), cost('4', 'materials', -100, '2026-11-07')], { code: '11752' }),
    proj('b', 'Myrtle, "the flip"', [cost('5', 'equipment', 300, '2026-11-10'), cost('6', 'materials', 50, '2026-11-11', { ownerOwes: { due: '2026-12-01' } })], { status: 'done' }),
  ];
  const estimates = [est('a', 10000), est('b', 2000)];

  it('gives one row per job: revenue, cost by kind, profit and margin', () => {
    const { rows, total } = sheetRows({ ...base, projects, estimates, contracts: [] });
    expect(rows[0]).toMatchObject({ projectId: 'a', code: '11752', title: 'Kim remodel', revenue: 10000, materials: 900, labor: 2500, subs: 500, equipment: 0, cost: 3900, profit: 6100, marginPct: 61 });
    // A cost the owner pays back is not the job's cost.
    expect(rows[1]).toMatchObject({ projectId: 'b', status: 'done', revenue: 2000, equipment: 300, materials: 0, cost: 300, profit: 1700 });
    expect(total).toMatchObject({ title: 'Total', revenue: 12000, cost: 4200, profit: 7800, marginPct: 65, materials: 900, labor: 2500, subs: 500, equipment: 300 });
  });

  it('for a period, counts the costs dated in it and what was invoiced and paid in it', () => {
    const c = { ...emptyContract('e-a'),
      invoices: [{ id: 'i1', number: 1001, date: '2026-11-03', dueDate: '2026-11-10', itemKey: 'm0', label: 'Deposit', amount: 4000, tax: 400 }, { id: 'i0', number: 1000, date: '2026-10-03', dueDate: '2026-10-10', itemKey: 'm1', label: 'Old', amount: 1000, tax: 100 }],
      payments: [{ id: 'p1', date: '2026-11-04', amount: 4400, method: 'check', invoiceId: 'i1' }] };
    const { rows, total } = sheetRows({ ...base, projects, estimates, contracts: [c as never], from: '2026-11-01', to: '2026-11-30' });
    expect(rows[0]).toMatchObject({ projectId: 'a', revenue: 4000, received: 4400, subs: 0, cost: 3400, profit: 600 });
    expect(rows[1]).toMatchObject({ projectId: 'b', revenue: 0, cost: 300, profit: -300 });
    expect(total.profit).toBe(300);
  });

  it('leaves out jobs with nothing in the period, and filters open or finished jobs', () => {
    expect(sheetRows({ ...base, projects, estimates, contracts: [], from: '2026-09-01', to: '2026-09-30' }).rows).toEqual([]);
    expect(sheetRows({ ...base, projects, estimates, contracts: [], status: 'done' }).rows.map((r) => r.projectId)).toEqual(['b']);
  });

  it('exports a file a spreadsheet opens: quoted text, plain numbers, a total row', () => {
    const { rows, total } = sheetRows({ ...base, projects, estimates, contracts: [] });
    const lines = sheetCsv(rows, total).split('\r\n');
    expect(lines[0]).toBe('Job code,Job,Status,Revenue,Received,Materials,Labor,Subs,Equipment,Total cost,Profit,Margin %');
    expect(lines[1]).toBe('11752,Kim remodel,Open,10000,0,900,2500,500,0,3900,6100,61');
    expect(lines[2]).toContain('"Myrtle, ""the flip""",Finished,2000');
    expect(lines[3].startsWith(',Total,,12000')).toBe(true);
    expect(lines).toHaveLength(4);
  });

  it('does not let a job title run as a formula in a spreadsheet', () => {
    const { rows, total } = sheetRows({ ...base, projects: [proj('x', '=HYPERLINK("http://x")', [])], estimates: [], contracts: [] });
    expect(sheetCsv(rows, total).split('\r\n')[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it('turns "this month", "this quarter" and "this year" into dates', () => {
    expect(periodRange('month', '2026-11-22')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('quarter', '2026-11-22')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('quarter', '2026-02-01')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(periodRange('year', '2026-11-22')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodRange('all', '2026-11-22')).toEqual({});
  });
});
