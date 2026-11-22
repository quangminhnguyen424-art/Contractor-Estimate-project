// The mail-in function's own logic (it runs on the server, in supabase/functions): tested here so it runs with the app's tests.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { cleanRead, htmlToText, withoutCardDigits, mailPrompt, pickAttachment, purchasesFrom, RECEIPT_PROMPT, tokenFrom, verifySvix } from '../../supabase/functions/_shared/receiptMail';
import { receiptPrompt } from '../engine/books';

describe('mail in: is this really from the mail provider', () => {
  const key = Buffer.from('a-secret-only-the-provider-knows');
  const secret = `whsec_${key.toString('base64')}`;
  const body = '{"type":"email.received"}';
  const sign = (id: string, t: number, b: string) => `v1,${createHmac('sha256', key).update(`${id}.${t}.${b}`).digest('base64')}`;
  const now = 1_800_000_000;

  it('accepts a call signed with the secret', async () => {
    expect(await verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: sign('msg_1', now, body) }, body, now)).toBe(true);
    expect(await verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,AAAA ${sign('msg_1', now, body)}` }, body, now)).toBe(true);
  });
  it('refuses a changed body, another secret, an old call, or missing headers', async () => {
    const sig = sign('msg_1', now, body);
    expect(await verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, `${body} `, now)).toBe(false);
    expect(await verifySvix(`whsec_${Buffer.from('other').toString('base64')}`, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(await verifySvix(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now + 301)).toBe(false);
    expect(await verifySvix(secret, { id: null, timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(await verifySvix('', { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).toBe(false);
  });
});

describe('mail in: whose mail is it', () => {
  it('finds the account code in the address it was sent to', () => {
    expect(tokenFrom(['r-ab12cd34ef56@in.studwise.ai'])).toBe('ab12cd34ef56');
    expect(tokenFrom(['someone@gmail.com', 'Studwise <R-AB12CD34EF56@in.studwise.ai>'])).toBe('ab12cd34ef56');
  });
  it('finds nothing in other addresses', () => {
    expect(tokenFrom(['hello@in.studwise.ai', 'r-short@in.studwise.ai', 'ar-ab12cd34ef56@in.studwise.ai'])).toBeNull();
    expect(tokenFrom([])).toBeNull();
  });
});

describe('mail in: what to read', () => {
  it('reads the biggest real attachment, not the logos in the mail', () => {
    const got = pickAttachment([
      { id: 'logo', filename: 'logo.png', content_type: 'image/png', content_disposition: 'inline', size: 9_000 },
      { id: 'small', filename: 'a.pdf', content_type: 'application/pdf', content_disposition: 'attachment', size: 40_000 },
      { id: 'big', filename: 'receipt.pdf', content_type: 'application/pdf', content_disposition: 'attachment', size: 90_000 },
    ]);
    expect(got).toEqual({ id: 'big', as: 'pdf', mime: 'application/pdf' });
  });
  it('takes a photo a phone put inside the mail, a purchase file by its name, and nothing it cannot read', () => {
    expect(pickAttachment([{ id: 'p', filename: 'IMG_1.jpeg', content_type: 'image/jpeg', content_disposition: 'inline', size: 2_400_000 }])).toEqual({ id: 'p', as: 'image', mime: 'image/jpeg' });
    expect(pickAttachment([{ id: 'c', filename: 'Purchase History.CSV', content_type: 'application/octet-stream', size: 30_000 }])).toEqual({ id: 'c', as: 'text', mime: 'text/csv' });
    expect(pickAttachment([{ id: 'z', filename: 'x.zip', content_type: 'application/zip', size: 30_000 }, { id: 'huge', filename: 'x.pdf', content_type: 'application/pdf', size: 30_000_000 }])).toBeNull();
    expect(pickAttachment([{ id: 'logo', filename: 'logo.png', content_type: 'image/png', content_disposition: 'inline', size: 9_000 }])).toBeNull();
  });
  it('turns an e-receipt page into plain text', () => {
    const t = htmlToText('<html><head><style>td{color:red}</style><script>x()</script></head><body><table><tr><td>Thinset&nbsp;50&nbsp;lb</td><td>&#36;40.00</td></tr><tr><td>PO/Job Name:</td><td>11752 &amp; Co</td></tr></table></body></html>');
    expect(t).toBe('Thinset 50 lb $40.00\nPO/Job Name: 11752 & Co');
    expect(htmlToText(`<p>${'x'.repeat(500)}</p>`, 100)).toHaveLength(100);
  });
  it('blanks card digits in the text before anything reads it', () => {
    expect(withoutCardDigits('VISA ****4242 USD$ 88.20')).toBe('VISA [card] USD$ 88.20');
    expect(withoutCardDigits('Mastercard ending in 9911\nDebit card xxxx-xxxx-xxxx-1234')).toBe('Mastercard [card]\nDebit card [card]');
    expect(withoutCardDigits('Card number 4111 1111 1111 1111 approved')).toBe('Card number [card] approved');
    // Receipt numbers, PO numbers, phone numbers and prices stay.
    const keep = 'Receipt 4829 00012 55501\nPO/Job Name 11752\nStore 4702 (206) 555-0134\n2 @ $40.00 = $80.00';
    expect(withoutCardDigits(keep)).toBe(keep);
  });
  it('asks the reader with the same words the app uses for a snapped receipt', () => {
    expect(RECEIPT_PROMPT).toBe(receiptPrompt([]).trim());
    expect(mailPrompt()).toContain(RECEIPT_PROMPT);
    expect(mailPrompt()).toContain('"purchases"');
    expect(mailPrompt()).toContain('"notReceipt"');
  });
});

describe('mail in: what the reader answered', () => {
  const one = { vendor: 'The Home Depot', date: '2026-11-20', tax: 8.2, total: 88.2, kind: 'materials', po: '11752', receiptNo: '4829', refund: false, lines: [{ name: 'Thinset', qty: 2, unit: 'bag', total: 80 }] };
  it('takes one purchase, or each purchase of a store file', () => {
    expect(purchasesFrom('```json\n' + JSON.stringify(one) + '\n```')).toEqual({ reads: [one], notReceipt: false });
    const many = purchasesFrom(JSON.stringify({ purchases: [one, { ...one, receiptNo: '4830' }, 'junk'] }));
    expect(many.reads.map((r) => r.receiptNo)).toEqual(['4829', '4830']);
    expect(purchasesFrom(JSON.stringify({ purchases: Array.from({ length: 90 }, () => one) })).reads).toHaveLength(60);
  });
  it('knows an ad from a receipt, and an answer it cannot use', () => {
    expect(purchasesFrom('{"notReceipt": true}')).toEqual({ reads: [], notReceipt: true });
    expect(purchasesFrom('Sorry, I cannot read this.')).toEqual({ reads: [], notReceipt: false });
  });
  it('keeps only what a receipt record holds: never a card detail the reader let through', () => {
    const got = cleanRead({ ...one, card: 'VISA 4242', payment: { last4: '4242' }, lines: [{ name: 'Thinset', qty: 2, unit: 'bag', total: 80, card: '4242' }] });
    expect(got).toEqual(one);
    expect(JSON.stringify(got)).not.toContain('4242');
  });
});
