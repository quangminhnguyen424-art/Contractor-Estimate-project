// Receipts that came by mail, on the app's side: the rows the server saved become receipts the inbox takes. Pure, so
// two phones that take the same row end with the same receipt and the same job cost.
import { parseReceipt, type ReceiptRead } from './books';

export const RECEIPT_DOMAIN = 'in.studwise.ai';

/** The address a company's receipts are mailed to. */
export const receiptAddress = (token: string) => `r-${token}@${RECEIPT_DOMAIN}`;

/** Ids counted from one seed ("<seed>-1", "<seed>-2"…): the same on every phone that handles the same mail. */
export const idsFrom = (seed: string) => {
  let n = 0;
  return () => `${seed}-${++n}`;
};

export interface MailRead {
  /** The mail row's id; the inbox item takes it. */
  id: string;
  kind: 'email' | 'file';
  at: string;
  read?: ReceiptRead;
  /** A mail no receipt could be read from (an ad, a confirmation code, a blurred photo): shown, not lost. */
  unread?: { from: string; subject: string };
  /** The photo's file name in the company's photo folder, when the mail was a photo of a paper receipt. */
  photo?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function mailReads(rows: unknown[]): MailRead[] {
  return rows.flatMap((r): MailRead[] => {
    if (!isObj(r) || typeof r.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(r.id) || typeof r.created_at !== 'string') return [];
    const head = { id: r.id, kind: r.kind === 'file' ? 'file' as const : 'email' as const, at: r.created_at };
    const photo = typeof r.photo === 'string' && /^[\w-]{1,80}\.jpg$/.test(r.photo) ? { photo: r.photo } : {};
    try {
      if (!isObj(r.read)) throw new Error('nothing was read');
      // The same check a snapped receipt goes through: only receipt fields come out, with sane values.
      return [{ ...head, read: parseReceipt(JSON.stringify(r.read)), ...photo }];
    } catch {
      return [{ ...head, kind: 'email', unread: { from: text(r.mail_from, 120), subject: text(r.subject, 160) } }];
    }
  });
}
