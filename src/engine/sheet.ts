// The money sheet: one row per job (revenue, cost by kind, profit) and a total, for all time or for a period. Every
// number comes from the same books a job's Money tab shows, so the sheet and the job never disagree.
import { emptyMoney, projectBooks, type CostEntry, type CostKind } from './books';
import type { Contract } from './contract';
import { codeOf } from './jobCode';
import type { SiteProject } from './site';
import type { Estimate, Profile } from './types';

export interface SheetRow {
  projectId: string;
  code: string;
  title: string;
  status: 'active' | 'done';
  /** The contract price with change orders; for a period, what was invoiced in it (before sales tax). */
  revenue: number;
  /** Money in from the owner; for a period, what came in during it. */
  received: number;
  materials: number;
  labor: number;
  subs: number;
  equipment: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface SheetInput {
  projects: SiteProject[];
  estimates: Estimate[];
  contracts: Contract[];
  profile: Profile | null;
  today: string;
  /** YYYY-MM-DD, both ends included. Without them the sheet is all time. */
  from?: string;
  to?: string;
  status?: 'active' | 'done';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
const margin = (profit: number, revenue: number) => (revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0);

export function sheetRows(input: SheetInput): { rows: SheetRow[]; total: SheetRow } {
  const { projects, estimates, contracts, profile, today, from, to, status } = input;
  const period = !!(from || to);
  const inRange = (d: string) => !!d && (!from || d >= from) && (!to || d <= to);

  const rows: SheetRow[] = [];
  for (const p of projects) {
    if (status && p.status !== status) continue;
    const est = estimates.find((e) => e.id === p.estimateId);
    const contract = contracts.find((c) => c.estimateId === p.estimateId);
    const money = p.money ?? emptyMoney();
    const head = { projectId: p.id, code: codeOf(p), title: p.title, status: p.status };

    if (!period) {
      const b = projectBooks({ est, profile, contract, money, today });
      rows.push({
        ...head, revenue: b.contract.price, received: b.owner.received,
        materials: b.cost.materials, labor: b.cost.labor, subs: b.cost.subs, equipment: b.cost.equipment,
        cost: b.cost.total, profit: b.profit.amount, marginPct: margin(b.profit.amount, b.contract.price),
      });
      continue;
    }

    // A cost the owner pays back is not the job's cost (the same rule the job's own books use).
    const costs = money.costs.filter((c: CostEntry) => !c.ownerOwes && inRange(c.date));
    const of = (k: CostKind) => sum(costs.filter((c) => c.kind === k).map((c) => c.amount));
    const invoices = (contract?.invoices ?? []).filter((v) => inRange(v.date));
    const payments = (contract?.payments ?? []).filter((x) => inRange(x.date));
    const paidBack = money.costs.filter((c) => c.ownerOwes?.paidOn && inRange(c.ownerOwes.paidOn));
    if (!costs.length && !invoices.length && !payments.length && !paidBack.length) continue;
    const revenue = sum(invoices.map((v) => v.amount));
    const cost = sum(costs.map((c) => c.amount));
    rows.push({
      ...head, revenue, received: sum([...payments.map((x) => x.amount), ...paidBack.map((c) => c.amount)]),
      materials: of('materials'), labor: of('labor'), subs: of('subs'), equipment: of('equipment'),
      cost, profit: r2(revenue - cost), marginPct: margin(revenue - cost, revenue),
    });
  }
  // Open jobs first; within each, the order the contractor already sees them in.
  rows.sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));

  const add = (k: keyof SheetRow) => sum(rows.map((r) => r[k] as number));
  const revenue = add('revenue'), profit = add('profit');
  const total: SheetRow = {
    projectId: '', code: '', title: 'Total', status: 'active', revenue, received: add('received'),
    materials: add('materials'), labor: add('labor'), subs: add('subs'), equipment: add('equipment'),
    cost: add('cost'), profit, marginPct: margin(profit, revenue),
  };
  return { rows, total };
}

/** Text a spreadsheet will show as typed: quoted when it must be, and never run as a formula. */
function cell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEAD = ['Job code', 'Job', 'Status', 'Revenue', 'Received', 'Materials', 'Labor', 'Subs', 'Equipment', 'Total cost', 'Profit', 'Margin %'];

/** The sheet as a .csv file (RFC 4180): a header, one row per job, a total row. Numbers are plain so they add up in a spreadsheet. */
export function sheetCsv(rows: SheetRow[], total: SheetRow): string {
  const nums = (r: SheetRow) => [r.revenue, r.received, r.materials, r.labor, r.subs, r.equipment, r.cost, r.profit, r.marginPct].map(String);
  return [
    HEAD.join(','),
    ...rows.map((r) => [cell(r.code), cell(r.title), r.status === 'active' ? 'Open' : 'Finished', ...nums(r)].join(',')),
    ['', 'Total', '', ...nums(total)].join(','),
  ].join('\r\n');
}

export type SheetPeriod = 'month' | 'quarter' | 'year' | 'all';

/** The first and last day of the month, quarter or year that `today` (YYYY-MM-DD) falls in; nothing for all time. */
export function periodRange(period: SheetPeriod, today: string): { from?: string; to?: string } {
  if (period === 'all') return {};
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const first = period === 'year' ? 1 : period === 'quarter' ? m - ((m - 1) % 3) : m;
  const last = period === 'year' ? 12 : period === 'quarter' ? first + 2 : m;
  const two = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${two(first)}-01`, to: `${y}-${two(last)}-${two(new Date(Date.UTC(y, last, 0)).getUTCDate())}` };
}
