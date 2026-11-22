import { describe, expect, it } from 'vitest';

import { baseOf, mergeWorkspaces } from '../cloud/merge';
import type { InboxItem } from '../engine/inbox';
import { EMPTY, sanitizePersisted } from './sanitize';

const sanitize = (raw: unknown) => sanitizePersisted(raw).data;

const item = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id, kind: 'email', vendor: 'Home Depot', date: '2026-11-20', total: 88.2, tax: 8.2, costKind: 'materials', lines: [], status: 'new', at: '2026-11-20T18:00:00.000Z', ...over,
});

describe('the inbox is part of the saved workspace', () => {
  it('survives saving and loading, with broken rows dropped', () => {
    const d = sanitize({ ...EMPTY, inbox: [item('a', { po: '11752', receiptNo: '4829', lines: [{ name: 'Thinset', qty: 2, unit: 'bag', total: 80 }] }), { id: 'bad' }, item('a'), 'junk', item('c', { status: 'weird' as never, total: -12.5 })] });
    expect(d.inbox!.map((x) => x.id)).toEqual(['a', 'c']);
    expect(d.inbox![0]).toMatchObject({ po: '11752', receiptNo: '4829', lines: [{ name: 'Thinset', total: 80 }] });
    expect(d.inbox![1]).toMatchObject({ status: 'new', total: -12.5 });
  });

  it('keeps the mark on a mail that could not be read', () => {
    const d = sanitize({ ...EMPTY, inbox: [{ ...item('m'), total: 0, status: 'ignored', unread: true }, { ...item('n'), unread: 'yes' }] });
    expect(d.inbox![0].unread).toBe(true);
    expect('unread' in d.inbox![1]).toBe(false);
  });

  it('never keeps card details that some other version or a tampered copy put on an item', () => {
    const d = sanitize({ ...EMPTY, inbox: [{ ...item('a'), card: '4242', last4: '4242' }] });
    expect(Object.keys(d.inbox![0])).not.toContain('card');
    expect(Object.keys(d.inbox![0])).not.toContain('last4');
  });

  it('two phones that took in the same mail end up with one item', () => {
    const base = { ...EMPTY };
    const a = { ...EMPTY, inbox: [item('mail-1'), item('mail-3')] };
    const b = { ...EMPTY, inbox: [item('mail-1'), item('mail-2')] };
    expect(mergeWorkspaces(a, b, baseOf(base)).inbox!.map((x) => x.id).sort()).toEqual(['mail-1', 'mail-2', 'mail-3']);
  });

  it('one phone filing an item wins over the other phone still showing it as new', () => {
    const base = { ...EMPTY, inbox: [item('m')] };
    const filed = { ...EMPTY, inbox: [item('m', { status: 'filed', projectId: 'p', costId: 'c' })] };
    expect(mergeWorkspaces(filed, base, baseOf(base)).inbox![0].status).toBe('filed');
  });
});
