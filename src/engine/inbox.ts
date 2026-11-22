// The receipts inbox: every purchase that reaches Studwise (a snapped photo, an e-receipt mailed in, a line of a
// store's purchase-history file) lands here first. One whose job name is exactly a job's code is filed by Studwise;
// the rest wait for the contractor to pick the job. Filing makes the same cost a receipt snapped inside a job makes,
// so the job's money, buy list and price lessons work as before. A purchase is counted once, whatever it came from.
//
// Nothing about how it was paid is kept: no card numbers, no card digits, no bank details.
import {
  applyReceiptToBuy, emptyMoney, lessonsFromReceipt, matchReceipt, nameMatch, removeReceiptFromBuy,
  type CostEntry, type CostKind, type PriceLesson, type ReceiptLine, type ReceiptRead,
} from './books';
import { matchCode } from './jobCode';
import type { SiteProject } from './site';

export interface InboxItem {
  id: string;
  /** How it arrived: snapped in the app, mailed to the receipts address, or read out of a store's purchase file. */
  kind: 'photo' | 'email' | 'file';
  vendor: string;
  date: string; // YYYY-MM-DD, '' when the receipt has none
  /** Paid, tax included. Negative for a return. */
  total: number;
  tax: number;
  costKind: CostKind;
  receiptNo?: string;
  /** The job name / PO as printed. */
  po?: string;
  lines: ReceiptLine[];
  /** The photo or original file. */
  fileUri?: string;
  status: 'new' | 'filed' | 'ignored';
  projectId?: string;
  costId?: string;
  /** Filed by Studwise on an exact job-code match (shown as such, with Undo). */
  auto?: boolean;
  /** A mail no receipt could be read from. It sits with the set-aside items so nothing sent in goes missing unseen. */
  unread?: boolean;
  at: string;
}

/** The slice of the workspace that filing a receipt touches. */
export interface InboxState { inbox: InboxItem[]; projects: SiteProject[]; lessons: PriceLesson[] }

type Purchase = Pick<InboxItem, 'vendor' | 'date' | 'total' | 'receiptNo'>;
const digits = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const cents = (n: number) => Math.round(n * 100);
const storesAlike = (a: string, b: string) => {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  return !!x && !!y && (x.includes(y) || y.includes(x) || nameMatch(a, b) >= 0.5);
};

/**
 * Whether two records are one purchase. With a receipt number on both, the numbers decide (two trips to one store can
 * cost the same). Otherwise: the same store, the same day and the same total to the cent.
 */
export function samePurchase(a: Purchase, b: Purchase): boolean {
  const na = digits(a.receiptNo), nb = digits(b.receiptNo);
  if (na && nb) return na === nb;
  return !!a.date && a.date === b.date && cents(a.total) === cents(b.total) && storesAlike(a.vendor, b.vendor);
}

/** Where a new item belongs: it is one already held (in the inbox, or as a cost typed into a job), or its job name is a job's code. */
export function place(item: InboxItem, inbox: InboxItem[], projects: SiteProject[]): { duplicateOf?: string; projectId?: string } {
  const held = inbox.find((x) => x.id === item.id || samePurchase(x, item));
  if (held) return { duplicateOf: held.id };
  const viaInbox = new Set(inbox.map((x) => x.costId).filter(Boolean));
  for (const p of projects) {
    const c = p.money?.costs.find((x) => !viaInbox.has(x.id) && samePurchase({ vendor: x.vendor, date: x.date, total: x.amount }, item));
    if (c) return { duplicateOf: `cost:${c.id}` };
  }
  const p = item.po ? matchCode(item.po, projects) : null;
  return p ? { projectId: p.id } : {};
}

export function costFrom(item: InboxItem, costId: string, lines: ReceiptLine[] = item.lines): CostEntry {
  return {
    id: costId, date: item.date || item.at.slice(0, 10), kind: item.costKind, vendor: item.vendor,
    note: item.po ? `Job name on receipt: ${item.po}` : '', amount: item.total,
    ...(item.fileUri ? { receiptUri: item.fileUri } : {}), ...(lines.length ? { lines } : {}),
    createdAt: item.at,
  };
}

export const inboxCounts = (inbox: InboxItem[]) => ({
  waiting: inbox.filter((x) => x.status === 'new').length,
  filed: inbox.filter((x) => x.status === 'filed').length,
});

const setItem = (s: InboxState, id: string, fn: (x: InboxItem) => InboxItem): InboxState => ({ ...s, inbox: s.inbox.map((x) => (x.id === id ? fn(x) : x)) });

/** Takes a filed item's cost back out of its job: the cost, what it ticked on the buy list, and the prices it taught. */
export function unfileItem(s: InboxState, id: string): InboxState {
  const item = s.inbox.find((x) => x.id === id);
  if (!item || item.status !== 'filed') return s;
  const cost = s.projects.find((p) => p.id === item.projectId)?.money?.costs.find((c) => c.id === item.costId);
  const { projectId, costId, auto, ...rest } = item;
  void auto;
  return {
    inbox: s.inbox.map((x) => (x.id === id ? { ...rest, status: 'new' } : x)),
    projects: !cost ? s.projects : s.projects.map((p) => (p.id === projectId && p.money ? {
      ...p, money: { ...p.money, costs: p.money.costs.filter((c) => c.id !== costId), buy: removeReceiptFromBuy(p.money.buy, cost.lines ?? []) },
    } : p)),
    lessons: s.lessons.filter((l) => l.costId !== costId),
  };
}

/** Files an item to a job (moving it there if it was filed elsewhere). `auto` marks a filing Studwise made itself. */
export function fileItem(s: InboxState, id: string, projectId: string, newId: () => string, auto = false): InboxState {
  if (!s.inbox.some((x) => x.id === id) || !s.projects.some((p) => p.id === projectId)) return s;
  const cleared = unfileItem(s, id);
  const item = cleared.inbox.find((x) => x.id === id)!;
  const project = cleared.projects.find((p) => p.id === projectId)!;
  const money = project.money ?? emptyMoney();
  // A return is money back: it does not tick the buy list or teach a price.
  const lines = item.total > 0 ? matchReceipt(item.lines, money.buy) : item.lines.map((l) => ({ ...l, buyId: undefined }));
  const costId = newId();
  const cost = costFrom(item, costId, lines);
  const taught = item.total > 0 ? lessonsFromReceipt(lines, money.buy, { at: cost.date, vendor: item.vendor, projectId, costId }, newId) : [];
  return {
    inbox: cleared.inbox.map((x) => (x.id === id ? { ...x, status: 'filed', projectId, costId, ...(auto ? { auto: true } : {}) } : x)),
    projects: cleared.projects.map((p) => (p.id === projectId ? {
      ...p, money: { ...money, costs: [...money.costs, cost], buy: item.total > 0 ? applyReceiptToBuy(money.buy, lines) : money.buy },
    } : p)),
    lessons: [...cleared.lessons, ...taught].slice(-3000),
  };
}

/** Sets an item aside as not a job cost (a personal purchase, an ad that read like a receipt). */
export function ignoreItem(s: InboxState, id: string): InboxState {
  if (!s.inbox.some((x) => x.id === id)) return s;
  return setItem(unfileItem(s, id), id, (x) => ({ ...x, status: 'ignored' }));
}

/** Puts a set-aside item back in line for a job. */
export function restoreItem(s: InboxState, id: string): InboxState {
  return s.inbox.some((x) => x.id === id && x.status === 'ignored' && !x.unread) ? setItem(s, id, (x) => ({ ...x, status: 'new' })) : s;
}

/**
 * A receipt arrives. One already held is not added again; if the one held is still waiting and this copy knows more
 * (the items, the job name), it is filled in, and filed when that names a job. A new one whose job name is exactly a
 * job's code is filed by Studwise; any other waits.
 */
export function receive(
  s: InboxState, read: ReceiptRead, meta: { id: string; kind: InboxItem['kind']; at: string; fileUri?: string; newId: () => string },
): { state: InboxState; id: string; filedTo?: string; duplicate?: boolean; keptFile: boolean } {
  const r = receiveItem(s, read, meta);
  // A photo nobody points at (a second copy of a purchase already held) is spare: the caller may delete it.
  return { ...r, keptFile: !!meta.fileUri && r.state.inbox.some((x) => x.fileUri === meta.fileUri) };
}

function receiveItem(
  s: InboxState, read: ReceiptRead, meta: { id: string; kind: InboxItem['kind']; at: string; fileUri?: string; newId: () => string },
): { state: InboxState; id: string; filedTo?: string; duplicate?: boolean } {
  const item: InboxItem = {
    id: meta.id, kind: meta.kind, vendor: read.vendor, date: read.date, total: read.total, tax: read.tax, costKind: read.kind,
    ...(read.receiptNo ? { receiptNo: read.receiptNo } : {}), ...(read.po ? { po: read.po } : {}),
    lines: read.lines, ...(meta.fileUri ? { fileUri: meta.fileUri } : {}), status: 'new', at: meta.at,
  };
  const where = place(item, s.inbox, s.projects);
  if (where.duplicateOf) {
    const held = s.inbox.find((x) => x.id === where.duplicateOf);
    if (!held || held.status !== 'new') return { state: s, id: where.duplicateOf, duplicate: true };
    const filled = setItem(s, held.id, (x) => ({
      ...x, ...(x.po ? {} : item.po ? { po: item.po } : {}), ...(x.receiptNo ? {} : item.receiptNo ? { receiptNo: item.receiptNo } : {}),
      lines: x.lines.length >= item.lines.length ? x.lines : item.lines, ...(x.fileUri ? {} : item.fileUri ? { fileUri: item.fileUri } : {}),
    }));
    const po = filled.inbox.find((x) => x.id === held.id)!.po;
    const p = po ? matchCode(po, filled.projects) : null;
    return p ? { state: fileItem(filled, held.id, p.id, meta.newId, true), id: held.id, filedTo: p.id, duplicate: true }
      : { state: filled, id: held.id, duplicate: true };
  }
  const added: InboxState = { ...s, inbox: [item, ...s.inbox] };
  return where.projectId ? { state: fileItem(added, item.id, where.projectId, meta.newId, true), id: item.id, filedTo: where.projectId }
    : { state: added, id: item.id };
}

/** A mail Studwise could not read a receipt from: kept in sight (set aside, with its subject), never counted as a cost. */
export function receiveUnread(s: InboxState, m: { id: string; at: string; from: string; subject: string }): InboxState {
  if (s.inbox.some((x) => x.id === m.id)) return s;
  const item: InboxItem = { id: m.id, kind: 'email', vendor: (m.subject || m.from).slice(0, 60), date: '', total: 0, tax: 0, costKind: 'materials', lines: [], status: 'ignored', unread: true, at: m.at };
  return { ...s, inbox: [item, ...s.inbox] };
}
