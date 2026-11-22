import { describe, expect, it } from 'vitest';

import { emptyMoney, type ReceiptRead } from './books';
import { fileItem, ignoreItem, inboxCounts, receive, samePurchase, unfileItem, type InboxState } from './inbox';
import type { SiteProject } from './site';

const proj = (id: string, address: string, over: Partial<SiteProject> = {}): SiteProject => ({
  id, title: `Job ${id}`, clientName: '', address, status: 'active', createdAt: '2026-11-01', rooms: [], logs: [], ...over,
});
const read = (over: Partial<ReceiptRead> = {}): ReceiptRead => ({
  vendor: 'The Home Depot', date: '2026-11-20', tax: 8.2, total: 88.2, kind: 'materials', po: '', receiptNo: '', refund: false,
  lines: [{ name: 'Thinset', qty: 2, unit: 'bag', total: 80 }], ...over,
});
let n = 0;
const newId = () => `id${++n}`;
const meta = (id: string, kind: 'photo' | 'email' | 'file' = 'email') => ({ id, kind, at: '2026-11-20T18:00:00.000Z', newId });
const start = (projects: SiteProject[]): InboxState => ({ inbox: [], projects, lessons: [] });
const costsOf = (s: InboxState, id: string) => s.projects.find((p) => p.id === id)?.money?.costs ?? [];

describe('samePurchase', () => {
  const a = { vendor: 'The Home Depot', date: '2026-11-20', total: 88.2, receiptNo: '' };
  it('knows one purchase by its receipt number', () => {
    expect(samePurchase({ ...a, receiptNo: '4829 0001' }, { ...a, vendor: 'HOME DEPOT #4712', receiptNo: '48290001' })).toBe(true);
    expect(samePurchase({ ...a, receiptNo: '111' }, { ...a, receiptNo: '222' })).toBe(false); // two trips, same total
  });
  it('else by store, day and total to the cent', () => {
    expect(samePurchase(a, { ...a, vendor: 'Home Depot' })).toBe(true);
    expect(samePurchase(a, { ...a, total: 88.21 })).toBe(false);
    expect(samePurchase(a, { ...a, date: '2026-11-21' })).toBe(false);
    expect(samePurchase(a, { ...a, vendor: "Lowe's" })).toBe(false);
    expect(samePurchase({ ...a, date: '' }, { ...a, date: '' })).toBe(false); // no day to compare: not enough to merge
  });
});

describe('a receipt arriving', () => {
  it('waits for the contractor when it names no job', () => {
    const r = receive(start([proj('a', '11752 20th Ave NE')]), read(), meta('m1'));
    expect(r.filedTo).toBeUndefined();
    expect(r.state.inbox).toMatchObject([{ id: 'm1', kind: 'email', status: 'new', total: 88.2, vendor: 'The Home Depot' }]);
    expect(costsOf(r.state, 'a')).toEqual([]);
    expect(inboxCounts(r.state.inbox)).toEqual({ waiting: 1, filed: 0 });
  });

  it('is filed by Studwise when the job name is exactly a job code', () => {
    const r = receive(start([proj('a', '11752 20th Ave NE'), proj('b', '1241 SW Myrtle St')]), read({ po: 'PO# 11752' }), meta('m1'));
    expect(r.filedTo).toBe('a');
    expect(r.state.inbox[0]).toMatchObject({ status: 'filed', projectId: 'a', auto: true });
    expect(costsOf(r.state, 'a')).toMatchObject([{ id: r.state.inbox[0].costId, amount: 88.2, vendor: 'The Home Depot', date: '2026-11-20', kind: 'materials' }]);
    expect(costsOf(r.state, 'b')).toEqual([]);
  });

  it('is never filed on part of a code or a misspelled one', () => {
    for (const po of ['117', '1175', '11753', 'kitchen']) {
      const r = receive(start([proj('a', '11752 20th Ave NE')]), read({ po }), meta('m1'));
      expect(r.state.inbox[0].status).toBe('new');
      expect(costsOf(r.state, 'a')).toEqual([]);
    }
  });

  it('counts one purchase once, whatever it came from', () => {
    const first = receive(start([proj('a', '11752 20th Ave NE')]), read({ po: '11752', receiptNo: '4829' }), meta('m1', 'email'));
    const again = receive(first.state, read({ po: '11752', receiptNo: '4829', vendor: 'HOME DEPOT' }), meta('m2', 'photo'));
    expect(again.duplicate).toBe(true);
    expect(again.state.inbox).toHaveLength(1);
    expect(costsOf(again.state, 'a')).toHaveLength(1);
    const fromFile = receive(again.state, read({ po: '11752' }), meta('m3', 'file')); // no receipt number in the store file
    expect(fromFile.duplicate).toBe(true);
    expect(costsOf(fromFile.state, 'a')).toHaveLength(1);
  });

  it('knows a cost the contractor already typed into a job', () => {
    const p = proj('a', '11752 20th Ave NE', { money: { ...emptyMoney(), costs: [{ id: 'c1', date: '2026-11-20', kind: 'materials', vendor: 'Home Depot', note: '', amount: 88.2, createdAt: 'x' }] } });
    const r = receive(start([p]), read({ po: '11752' }), meta('m1'));
    expect(r.duplicate).toBe(true);
    expect(r.state.inbox).toEqual([]);
    expect(costsOf(r.state, 'a')).toHaveLength(1);
  });

  it('fills in a waiting photo when the e-receipt of the same purchase names the job', () => {
    const photo = receive(start([proj('a', '11752 20th Ave NE')]), read({ lines: [] }), meta('m1', 'photo'));
    const mail = receive(photo.state, read({ po: '11752' }), meta('m2', 'email'));
    expect(mail.duplicate).toBe(true);
    expect(mail.state.inbox).toHaveLength(1);
    expect(mail.state.inbox[0]).toMatchObject({ id: 'm1', status: 'filed', projectId: 'a', po: '11752' });
    expect(mail.state.inbox[0].lines).toHaveLength(1);
  });

  it('takes a return off the job', () => {
    const bought = receive(start([proj('a', '11752 20th Ave NE')]), read({ po: '11752', receiptNo: '1' }), meta('m1'));
    const back = receive(bought.state, read({ po: '11752', receiptNo: '2', refund: true, total: -88.2 }), meta('m2'));
    expect(back.filedTo).toBe('a');
    expect(costsOf(back.state, 'a').map((c) => c.amount)).toEqual([88.2, -88.2]);
  });

  it('marks what it paid for on the buy list and teaches the price', () => {
    const p = proj('a', '11752 20th Ave NE', { money: { ...emptyMoney(), buy: [{ id: 'b1', name: 'Modified thinset, 50 lb', qty: 2, unit: 'bag', estCost: 56, bought: false, source: 'estimate' }] } });
    const r = receive(start([p]), read({ po: '11752', lines: [{ name: 'Thinset modified 50 lb', qty: 2, unit: 'bag', total: 80 }] }), meta('m1'));
    expect(r.state.projects[0].money!.buy[0]).toMatchObject({ bought: true, spent: 80 });
    expect(r.state.lessons).toMatchObject([{ item: 'Modified thinset, 50 lb', paid: 40, quoted: 28, costId: r.state.inbox[0].costId }]);
  });
});

describe('filing by hand, moving and undoing', () => {
  const two = () => receive(start([proj('a', '11752 20th Ave NE'), proj('b', '1241 SW Myrtle St')]), read(), meta('m1')).state;

  it('files a waiting receipt to the job picked', () => {
    const s = fileItem(two(), 'm1', 'b', newId);
    expect(s.inbox[0]).toMatchObject({ status: 'filed', projectId: 'b' });
    expect(s.inbox[0].auto).toBeUndefined();
    expect(costsOf(s, 'b')).toHaveLength(1);
  });

  it('moves a filed receipt: one cost, in the new job', () => {
    const s = fileItem(fileItem(two(), 'm1', 'b', newId), 'm1', 'a', newId);
    expect(costsOf(s, 'b')).toEqual([]);
    expect(costsOf(s, 'a')).toHaveLength(1);
    expect(s.inbox[0].projectId).toBe('a');
  });

  it('undoes: the cost, the buy-list mark and the lesson all go', () => {
    const p = proj('a', '11752 20th Ave NE', { money: { ...emptyMoney(), buy: [{ id: 'b1', name: 'Thinset', qty: 2, unit: 'bag', estCost: 56, bought: false, source: 'estimate' }] } });
    const filed = receive(start([p]), read({ po: '11752' }), meta('m1')).state;
    const s = unfileItem(filed, 'm1');
    expect(s.inbox[0]).toMatchObject({ status: 'new' });
    expect(s.inbox[0].projectId).toBeUndefined();
    expect(costsOf(s, 'a')).toEqual([]);
    expect(s.projects[0].money!.buy[0].bought).toBe(false);
    expect(s.lessons).toEqual([]);
  });

  it('still undoes after the job was deleted, and after it was finished', () => {
    const filed = fileItem(two(), 'm1', 'b', newId);
    const gone = unfileItem({ ...filed, projects: filed.projects.filter((p) => p.id !== 'b') }, 'm1');
    expect(gone.inbox[0].status).toBe('new');
    const done = unfileItem({ ...filed, projects: filed.projects.map((p) => ({ ...p, status: 'done' as const })) }, 'm1');
    expect(costsOf(done, 'b')).toEqual([]);
  });

  it('sets a receipt aside as not a job cost, taking its cost with it', () => {
    const s = ignoreItem(fileItem(two(), 'm1', 'b', newId), 'm1');
    expect(s.inbox[0].status).toBe('ignored');
    expect(costsOf(s, 'b')).toEqual([]);
    expect(inboxCounts(s.inbox)).toEqual({ waiting: 0, filed: 0 });
  });

  it('leaves everything alone for an unknown receipt or job', () => {
    const s = two();
    expect(fileItem(s, 'nope', 'a', newId)).toBe(s);
    expect(fileItem(s, 'm1', 'nope', newId)).toBe(s);
    expect(unfileItem(s, 'm1')).toBe(s);
  });
});
