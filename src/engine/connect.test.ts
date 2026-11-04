import { describe, expect, it } from 'vitest';

import { calendarIcs, csvCell, estimatePayload, estimatesCsv, quickbooksInvoicesCsv, validHookUrl } from './connect';
import { emptyContract, type Contract } from './contract';
import type { CalEvent } from './schedule';
import type { Estimate, Profile } from './types';

const profile = { companyName: 'Upgrade Home', schedule: [{ label: 'Deposit', pct: 10 }, { label: 'Final', pct: 90 }] } as Profile;
const est = {
  id: 'e1', title: 'Hall bath', clientName: 'Kim, Jane', address: '12 Main', price: 20000, tax: 2000, total: 22000, salesTaxPct: 10, status: 'won',
  createdAt: '2026-11-01T10:00:00Z', jobTypeId: 'bathroom', cost: 15000, laborTotal: 9000, materialTotal: 6000, markupPct: 25,
} as unknown as Estimate;

describe('spreadsheet files', () => {
  it('quotes commas and never lets a cell run as a formula', () => {
    expect(csvCell('Kim, Jane')).toBe('"Kim, Jane"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1200.50')).toBe('-1200.50');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('estimates leave out costs unless asked', () => {
    expect(estimatesCsv([est])).not.toContain('15000');
    expect(estimatesCsv([est], true)).toContain('15000.00');
    expect(estimatesCsv([est])).toContain('11/01/2026');
  });
  it('QuickBooks invoice import: one row per invoice, US dates, amount before tax and the rate', () => {
    const c: Contract = { ...emptyContract('e1'), invoices: [{ id: 'i', number: 1001, date: '2026-11-02', dueDate: '2026-11-09', itemKey: 'm0', label: 'Deposit (10%)', amount: 2000, tax: 200 }] };
    const csv = quickbooksInvoicesCsv([c], [est], profile).split('\r\n');
    expect(csv[0]).toBe('InvoiceNo,Customer,InvoiceDate,DueDate,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,Taxable,TaxRate');
    expect(csv[1]).toBe('1001,"Kim, Jane",11/02/2026,11/09/2026,Hall bath,Construction,Deposit (10%),1,2000.00,2000.00,Y,10%');
  });
});

describe('calendar and webhook', () => {
  const ev = (id: string, date: string, done = false): CalEvent => ({ id, title: `Visit ${id}`, kind: 'visit', date, time: '09:00', durationMin: 60, address: '', notes: '', remindMin: null, done, createdAt: '' });
  it('puts every upcoming appointment in one calendar file', () => {
    const ics = calendarIcs([ev('a', '2026-11-05'), ev('b', '2026-11-06'), ev('old', '2026-10-01'), ev('done', '2026-11-07', true)], '2026-11-04', 'Upgrade Home');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(calendarIcs([], '2026-11-04', '')).toBe('');
  });
  it('only sends to secure, outside links, and keeps costs private by default', () => {
    expect(validHookUrl('https://hooks.zapier.com/hooks/catch/1/abc/')).toBe(true);
    expect(validHookUrl('http://hooks.zapier.com/x')).toBe(false);
    expect(validHookUrl('https://192.168.1.10/x')).toBe(false);
    expect(validHookUrl('https://localhost/x')).toBe(false);
    expect(validHookUrl('not a link')).toBe(false);
    expect(estimatePayload(est, false)).not.toHaveProperty('cost');
    expect(estimatePayload(est, true)).toMatchObject({ cost: 15000, markupPct: 25 });
  });
});
