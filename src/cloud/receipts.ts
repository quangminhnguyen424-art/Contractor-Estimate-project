// Receipts by mail, on the app's side: the company's receipts address, and bringing in what the server read from mail
// sent to it. The reading happens on the server (supabase/functions/receipts-in); this only collects the results.
import type { InboxItem } from '@/engine/inbox';
import type { ReceiptRead } from '@/engine/books';
import { mailReads, receiptAddress } from '@/engine/mailIn';
import { cloudPhotoUri } from '@/ui/photoStore';

import { supabase } from './client';
import { cloudConfigured } from './config';

/** The address this company's receipts are mailed to, or null while mail-in is not switched on (or offline, or signed out). */
export async function getReceiptAddress(): Promise<string | null> {
  if (!cloudConfigured) return null;
  try {
    const { data, error } = await supabase.rpc('my_receipt_address');
    return !error && typeof data === 'string' && data ? receiptAddress(data) : null;
  } catch {
    return null;
  }
}

/** Retires the address and gives a new one (the old one stops taking mail at once). Only the account's owner can. */
export async function newReceiptAddress(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('new_receipt_address');
    return !error && typeof data === 'string' && data ? receiptAddress(data) : null;
  } catch {
    return null;
  }
}

interface Taker {
  addReceipt: (read: ReceiptRead, kind: InboxItem['kind'], fileUri?: string, mail?: { id: string; at: string }) => unknown;
  addUnreadMail: (m: { id: string; at: string; from: string; subject: string }) => void;
}

let draining = false;

/**
 * Takes the receipts that arrived by mail since last time into the inbox, then marks them taken. Safe to run on every
 * phone of the account at once: an item carries its mail's id, so the same mail is one receipt and one cost.
 */
export async function drainMail(app: Taker): Promise<number> {
  if (!cloudConfigured || draining) return 0;
  draining = true;
  try {
    const { data, error } = await supabase.from('receipt_mail')
      .select('id, kind, read, mail_from, subject, photo, created_at').is('taken_at', null).order('created_at', { ascending: true }).limit(60);
    if (error || !data?.length) return 0;
    const reads = mailReads(data);
    for (const m of reads) {
      if (m.read) app.addReceipt(m.read, m.kind, m.photo ? cloudPhotoUri(m.photo) : undefined, { id: m.id, at: m.at });
      else app.addUnreadMail({ id: m.id, at: m.at, from: m.unread?.from ?? '', subject: m.unread?.subject ?? '' });
    }
    // Only now: a phone that stops halfway takes the same rows again next time, and the ids make that harmless.
    await supabase.from('receipt_mail').update({ taken_at: new Date().toISOString() }).in('id', data.map((r) => r.id as string));
    // What was taken lives in the workspace now. The server's copy is kept a week for the account's other phones, then removed.
    await supabase.from('receipt_mail').delete().lt('taken_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    return reads.length;
  } catch {
    return 0;
  } finally {
    draining = false;
  }
}
