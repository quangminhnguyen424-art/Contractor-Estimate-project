# Receipts that file themselves, and the money sheet: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purchases reach the right project without a photo per purchase, and one sheet shows revenue, cost and profit per project and for the company.

**Architecture:** Receipts wait in an inbox that is part of the synced workspace (`inbox: InboxItem[]`), so it works offline and across a team like every other list. Filing an item creates the same `CostEntry` a snapped receipt creates today. Mail arrives at a server queue (`receipt_mail`) that the app drains into the inbox. The sheet is a pure function over projects, contracts and estimates.

**Tech Stack:** Expo / React Native (TypeScript), vitest, Supabase (Postgres, edge functions in Deno), Resend Inbound, the existing `ai` proxy.

**Spec:** `docs/superpowers/specs/2026-11-22-receipts-and-job-books-design.md`

## Global Constraints

- No bank or card connection of any kind. No card digits stored: the reader never returns them and `InboxItem` has no field for them.
- Automatic filing only on an exact job-code match. Everything else waits for the contractor.
- One purchase is counted once, whatever it came from (photo, mail, store file, or a cost already typed into a job).
- Cost, labor and profit are never shown outside the contractor's account.
- Filing creates a `CostEntry` through `updateMoney`; `projectBooks()` and the buy list are not changed.
- Pro and Team plans (and the beta) get the inbox and mail-in; Starter keeps snap-a-receipt inside a job.
- All new wording has Vietnamese in `src/i18n/vi.json`; no new native module (the app must keep updating over the air).

## Review Focus

1. The same purchase from two sources (a mailed e-receipt and a snapped photo, or a store-file line) becomes one item and one cost.
2. A receipt whose job name is missing, misspelled, or only part of a code ("117" for job "11752") is never filed automatically.
3. A return or refund receipt lowers the job's cost instead of being rejected or added.
4. A filed item can be moved or undone after its project was finished or deleted, without leaving a cost behind.
5. Two phones of one team drain the same mail: one item, filed once.

---

### Task 1: Job codes

**Files:** Create `src/engine/jobCode.ts`, `src/engine/jobCode.test.ts`. Modify `src/engine/site.ts` (`SiteProject.code?: string`), `src/store/sanitize.ts` (keep `code`), `src/store/AppContext.tsx` (set a code when a project is made, both places that call `projectFromEstimate`).

**Interfaces (produces):**
- `normCode(s: string): string` upper-case, drops spaces, `#`, `-`, and a leading `PO` / `JOB` / `JOB NAME`.
- `jobCodeFor(address: string, title: string, taken: string[]): string` house number, else first street word, else first title word; 3 to 10 characters; adds `-2`, `-3` when taken.
- `codeOf(p: SiteProject): string` the stored code, else one derived from the address (projects made before this change).
- `matchCode(text: string, projects: SiteProject[]): SiteProject | null` exact match after `normCode` on any whitespace/punctuation-separated token or the whole text; active projects before finished ones; two matches means no match.

- [ ] Tests: `jobCodeFor('11752 20th Ave NE, Seattle', 'Kim remodel', [])` is `'11752'`; taken gives `'11752-2'`; `'Myrtle St'` gives `'MYRTLE'`; no address gives the first title word. `matchCode('PO# 11752', …)`, `'job: myrtle'`, `'11752 KITCHEN'` match; `'117'`, `''`, `'1175'` do not; a code shared by two projects does not.
- [ ] Implement, run `npx vitest run src/engine/jobCode.test.ts`, commit.

### Task 2: The reader also returns the job name, receipt number and refunds

**Files:** Modify `src/engine/books.ts` (`ReceiptRead` gains `po: string`, `receiptNo: string`, `refund: boolean`; `receiptPrompt` asks for them and says never to return card numbers; `parseReceipt` keeps them, and accepts a refund as a negative `total`). Test in `src/engine/books.test.ts` (existing file).

- [ ] Tests: a reply with `"po":"11752"`, `"receiptNo":"4829 00012 55501"` keeps both; `"refund":true,"total":84.2` parses to `total: -84.2`; a reply carrying a `card` field does not surface it; existing receipt tests still pass.
- [ ] Implement, run the file, commit.

### Task 3: The inbox

**Files:** Create `src/engine/inbox.ts`, `src/engine/inbox.test.ts`. Modify `src/store/sanitize.ts` (`Persisted.inbox?: InboxItem[]`, `sanitizeInbox`), `src/cloud/merge.ts` (`inbox` in `LISTS`, keyed by `id`), `src/store/AppContext.tsx` (actions below).

**Interfaces (produces):**
```ts
export interface InboxItem {
  id: string; kind: 'photo' | 'email' | 'file';
  vendor: string; date: string; total: number; tax: number; costKind: CostKind;
  receiptNo?: string; po?: string; lines: ReceiptLine[]; fileUri?: string;
  status: 'new' | 'filed' | 'ignored';
  projectId?: string; costId?: string; auto?: boolean; at: string;
}
samePurchase(a: Pick<InboxItem,'vendor'|'date'|'total'|'receiptNo'>, b: same): boolean
  // equal receipt numbers, or equal totals to the cent + same date + vendors alike (nameMatch >= 0.5 or one contains the other)
place(item: InboxItem, inbox: InboxItem[], projects: SiteProject[]): { duplicateOf?: string; projectId?: string }
  // duplicate of an inbox item or of a cost already in any project; else the project its `po` matches exactly
costFrom(item: InboxItem, costId: string): CostEntry
inboxCounts(inbox): { waiting: number; filed: number }
```
AppContext: `addReceipt(read: ReceiptRead, kind, fileUri?, id?): { id: string; filedTo?: string; duplicate?: boolean }`, `fileReceipt(id, projectId)`, `unfileReceipt(id)`, `ignoreReceipt(id)`. Filing matches lines to that project's buy list and adds price lessons exactly as `cost.tsx` does; unfiling removes the cost and takes its amounts back off the buy list (`removeReceiptFromBuy`).

- [ ] Tests (Review Focus 1, 2, 3, 4): two reads of one purchase give one item; a photo of a cost already typed into a job is a duplicate; `po: '117'` with job `11752` stays `new`; `po: '11752'` is filed with `auto: true`; a refund files as a negative cost; unfiling after the project was deleted leaves the item `new` and no cost.
- [ ] Implement, run `npx vitest run src/engine/inbox.test.ts src/cloud/merge.test.ts`, commit.

### Task 4: Receipts screen, and where it shows

**Files:** Create `src/app/receipts.tsx`. Modify `src/app/_layout.tsx` (route `receipts`, title "Receipts"), `src/ui/Dashboard.tsx` (a "Needs you today" row when `waiting > 0`), `src/app/(tabs)/me.tsx` (rows "Receipts" and "Money sheet" under Your work), `src/app/site/[id]/index.tsx` or the job page header (show `codeOf(p)` with "At checkout, give this as the Job Name / PO", and an edit field).

- [ ] Screen: "Snap a receipt" (same camera + `receiptPrompt` + `parseReceipt` flow as `cost.tsx`, then `addReceipt`); list *Needs a job* (store, date, amount, the job name read, a project picker with the active projects, "Not a job cost"); list *Filed* for the last 30 days (project, "Filed by Studwise" when `auto`, Move, Undo). Empty state explains the job code.
- [ ] Starter plan: the screen explains it is part of Pro and Team and links to `/plan`; beta and no-plan-system accounts get it.
- [ ] Browser run with the web build: snap is replaced by a canned reader reply; check automatic filing, picking a project, undo. Commit.

### Task 5: Money sheet

**Files:** Create `src/engine/sheet.ts`, `src/engine/sheet.test.ts`, `src/app/books.tsx`. Modify `src/app/_layout.tsx` (route `books`, title "Money sheet").

**Interfaces (produces):**
```ts
export interface SheetRow { projectId: string; code: string; title: string; status: 'active' | 'done';
  revenue: number; received: number; materials: number; labor: number; subs: number; equipment: number; cost: number; profit: number; marginPct: number }
sheetRows(input: { projects, estimates, contracts, profile, today, from?: string, to?: string, status?: 'active' | 'done' }): { rows: SheetRow[]; total: SheetRow }
  // numbers from projectBooks(); with from/to, costs are those dated in the range and revenue is what was invoiced in it
sheetCsv(rows, total): string  // header row, one row per project, a TOTAL row; RFC 4180 quoting; plain numbers
```
- [ ] Tests: two projects with known costs give the expected row and total; a date range leaves out a cost outside it; a title with a comma and a quote survives `sheetCsv`.
- [ ] Screen: period chips (This month, This quarter, This year, All), open / finished, the table (scrolls sideways on a phone, first column fixed), totals, "Export" through `shareTextFile(name, csv, 'text/csv')` on the phone and a download on the web. Tapping a row opens `/site/<id>/money`. Commit.

### Task 6: Mail in

**Files:** Create `supabase/migrations/20261122000000_receipts.sql`, `supabase/functions/receipts-in/index.ts`, `src/cloud/receipts.ts`, `src/cloud/receipts.test.ts`. Modify `src/cloud/CloudProvider.tsx` (drain after each sync), `src/app/receipts.tsx` (the address and set-up steps), `run-in-supabase.sql` on the owner's PC is regenerated by hand later.

- [ ] SQL: `receipt_addresses(token text primary key, owner uuid unique)`, `receipt_mail(id uuid pk, owner uuid, read jsonb, file_path text, created_at, taken_at)`, RLS through `workspace_of(auth.uid())` (select and update only), `my_receipt_address()` returns the caller's workspace token, creating it on first use (12 random lower-case letters and digits).
- [ ] Function: checks the Resend webhook signature (secret `RESEND_WEBHOOK_SECRET`); takes the token from the `r-<token>@` recipient; fetches the message and attachments from Resend (`RESEND_API_KEY`); stores the largest attachment (or the HTML) under `photos/<owner>/receipts/`; asks Claude with `receiptPrompt([])` (text for HTML and CSV, image or document blocks for attachments); a purchase-history file may return several purchases, one row each; inserts `receipt_mail` rows. Unknown token or unreadable mail: 200 with nothing stored, so Resend does not retry forever. At most 30 mails per address per day.
- [ ] Client: `getReceiptAddress(): Promise<string | null>`, `mailToItems(rows): InboxItem[]` (pure, tested: bad rows dropped, `id` is the row id so two phones make the same item, Review Focus 5), `drainMail(add)` selects untaken rows, calls `addReceipt(read, 'email' | 'file', path, id)`, then stamps `taken_at`.
- [ ] Set-up card on the Receipts screen: the address with Copy, and three short how-tos (Home Depot Pro Xtra, Lowe's Pro, any other store: forward rule; plus "email the purchase-history file to this address once a month"). Until the server answers, the card says mail-in is being set up.
- [ ] This task cannot be run end to end until studwise.ai and Resend exist: commit the code, list the deploy steps in the hand-off.

### Task 7: Terms, privacy, wording, release

**Files:** `src/engine/legal.ts`, `src/engine/privacy.ts` (new section on receipts by mail; what is never collected; new version dates), `src/i18n/vi.json`, `src/i18n/catalog.json`.

- [ ] `node scripts/i18n-extract.mjs`, translate every new string, `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`.
- [ ] Build web (`npm run build:web-single`), browser run of Tasks 4 and 5, hosted build, commit, push.
