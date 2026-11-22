import { describe, expect, it } from 'vitest';

import { receive, receiveUnread, type InboxState } from './inbox';
import { idsFrom, mailReads, receiptAddress } from './mailIn';
import type { SiteProject } from './site';

const read = { vendor: 'The Home Depot', date: '2026-11-20', tax: 8.2, total: 88.2, kind: 'materials', po: 'PO 11752', receiptNo: '4829', refund: false, lines: [{ name: 'Thinset', qty: 2, unit: 'bag', total: 80 }] };
const row = (over: Record<string, unknown> = {}) => ({ id: '0b0e3f0a-1111-4222-8333-444455556666', kind: 'email', read, mail_from: 'HomeDepot@order.homedepot.com', subject: 'Your receipt', photo: null, created_at: '2026-11-20T18:00:00.000Z', ...over });

describe('receipts that came by mail', () => {
  it('become receipts the inbox can take, keyed by the mail row so two phones agree', () => {
    const [m] = mailReads([row()]);
    expect(m).toMatchObject({ id: '0b0e3f0a-1111-4222-8333-444455556666', kind: 'email', at: '2026-11-20T18:00:00.000Z' });
    expect(m.read).toMatchObject({ vendor: 'The Home Depot', total: 88.2, po: 'PO 11752', receiptNo: '4829' });
    expect(mailReads([row({ kind: 'file' })])[0].kind).toBe('file');
  });
  it('keep nothing but receipt fields, whatever the row holds', () => {
    const [m] = mailReads([row({ read: { ...read, card: 'VISA 4242' } })]);
    expect(JSON.stringify(m)).not.toContain('4242');
  });
  it('mark mail Studwise could not read, so it is shown and not lost', () => {
    const [m] = mailReads([row({ read: null })]);
    expect(m.read).toBeUndefined();
    expect(m.unread).toEqual({ from: 'HomeDepot@order.homedepot.com', subject: 'Your receipt' });
    expect(mailReads([row({ read: { vendor: 'Ad', total: 0 } })])[0].unread).toBeTruthy();
  });
  it('drop rows that are not mail rows, and photo names that are not plain file names', () => {
    expect(mailReads([null, 'x', { read }, row({ id: 7 })])).toEqual([]);
    expect(mailReads([row({ photo: 'abc-123.jpg' })])[0].photo).toBe('abc-123.jpg');
    expect(mailReads([row({ photo: '../other/abc.jpg' })])[0].photo).toBeUndefined();
  });
  it('write the address the crew sends to', () => {
    expect(receiptAddress('ab12cd34ef56')).toBe('r-ab12cd34ef56@in.studwise.ai');
  });
  it('two phones that take the same mail make the same job cost, not two', () => {
    const projects = [{ id: 'pa', title: 'Kim remodel', clientName: '', address: '11752 20th Ave NE', status: 'active', code: '11752', createdAt: '2026-11-01', rooms: [], logs: [] }] as SiteProject[];
    const start: InboxState = { inbox: [], projects, lessons: [] };
    const [m] = mailReads([row()]);
    const phone = () => receive(start, m.read!, { id: m.id, kind: m.kind, at: m.at, newId: idsFrom(m.id) });
    const a = phone(), b = phone();
    expect(a.filedTo).toBe('pa');
    expect(a.state).toEqual(b.state);
    expect(a.state.projects[0].money?.costs[0].id).toBe(`${m.id}-1`);
  });

  it('mail that could not be read is set aside where the contractor can see it, once', () => {
    const start: InboxState = { inbox: [], projects: [], lessons: [] };
    const m = { id: 'm1', at: '2026-11-20T18:00:00.000Z', from: 'forwarding-noreply@google.com', subject: '(#409483493) Gmail Forwarding Confirmation' };
    const once = receiveUnread(start, m);
    expect(once.inbox).toEqual([{ id: 'm1', kind: 'email', vendor: '(#409483493) Gmail Forwarding Confirmation', date: '', total: 0, tax: 0, costKind: 'materials', lines: [], status: 'ignored', unread: true, at: m.at }]);
    expect(receiveUnread(once, m)).toBe(once);
    expect(receiveUnread(start, { ...m, subject: '' }).inbox[0].vendor).toBe('forwarding-noreply@google.com');
  });
});
