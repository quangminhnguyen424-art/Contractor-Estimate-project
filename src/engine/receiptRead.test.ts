import { describe, expect, it } from 'vitest';

import { parseReceipt, receiptPrompt } from './books';

describe('reading a receipt for the inbox', () => {
  it('keeps the job name / PO and the receipt number', () => {
    const r = parseReceipt('{"vendor":"The Home Depot","date":"2026-11-20","tax":8.2,"total":88.2,"po":" 11752 ","receiptNo":"4829 00012 55501","lines":[{"name":"Thinset","qty":2,"unit":"bag","total":80}]}');
    expect(r.po).toBe('11752');
    expect(r.receiptNo).toBe('4829 00012 55501');
    expect(r.refund).toBe(false);
  });

  it('leaves them empty when the receipt has none', () => {
    const r = parseReceipt('{"vendor":"Ace","total":12.5,"lines":[]}');
    expect(r.po).toBe('');
    expect(r.receiptNo).toBe('');
  });

  it('reads a return as money back', () => {
    const r = parseReceipt('{"vendor":"Lowe\'s","date":"2026-11-21","refund":true,"tax":7.2,"total":84.2,"lines":[{"name":"Faucet","qty":1,"unit":"ea","total":77}]}');
    expect(r.refund).toBe(true);
    expect(r.total).toBe(-84.2);
    expect(parseReceipt('{"vendor":"Lowe\'s","total":-84.2,"lines":[]}').total).toBe(-84.2);
  });

  it('never carries card details, whatever the reply holds', () => {
    const r = parseReceipt('{"vendor":"Ace","total":10,"card":"VISA 4242","last4":"4242","lines":[]}') as unknown as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(['date', 'kind', 'lines', 'po', 'receiptNo', 'refund', 'tax', 'total', 'vendor']);
  });

  it('asks the reader for the job name and tells it to leave card numbers out', () => {
    const p = receiptPrompt([]);
    expect(p).toContain('"po"');
    expect(p).toContain('"receiptNo"');
    expect(p).toContain('"refund"');
    expect(p).toMatch(/never.*card/i);
  });
});
