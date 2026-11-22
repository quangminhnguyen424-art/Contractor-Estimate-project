# Receipts that file themselves, and one money sheet per project

Date: 2026-11-22. Status: waiting for the owner's approval.

## Why

The owner's crew buys most materials, at Home Depot, Lowe's, Ace and smaller suppliers. Nobody photographs every
receipt, so job costs in Studwise are incomplete and the profit number on a job cannot be trusted. He wants every
purchase to reach the right project without the contractor doing anything per purchase, and one sheet per project
(and for the company) showing revenue, expense and profit, with crew labor in it.

What exists today: inside a job's Money tab the contractor snaps a receipt, the AI reads the lines, matches them to
the job's buy list and records a cost; crew days from the schedule become labor costs; `projectBooks()` already works
out contract price, cost by kind, profit and what the owner owes. Missing: receipts arriving on their own, the AI
choosing the project, a place for what it could not place, purchases that never produced a receipt, and a sheet
across projects.

## Goals

- A purchase tied to the contractor's store account or company card shows up in Studwise with no action per purchase.
- Each one is filed to a project by the job name / PO given at the register. What cannot be placed waits in one
  inbox and takes one tap to file.
- A card purchase with no receipt is shown as such, so nothing is silently missing.
- One sheet: per project and all projects, revenue, cost by kind (materials, labor, subs, equipment), profit, margin.
  Export as CSV.

## Not in this work

- Logging in to a retailer's website with the contractor's password (rejected: stores passwords, breaks on site
  changes and 2-step codes, likely against retailer terms).
- An official Home Depot / Lowe's partner feed. Worth applying for once there are users; nothing here depends on it.
- Paying bills, payroll, tax filing, or replacing QuickBooks.
- Tracking money owed back to a crew member who paid out of pocket (a paper receipt still comes in by photo; the
  pay-back is a later feature).
- Banks outside the US.

## Must never happen

- A cost filed to the wrong job without the contractor being able to see why and move it in one tap.
- Studwise holding a bank or retailer password.
- Cost, labor rates or profit shown to a client or to crew.
- The same purchase counted twice (a snapped photo, an e-receipt and the card line are one purchase).

## Approaches considered

A. E-receipt emails forwarded to a private Studwise address. Full line items and the job name / PO. Works for any
   store that emails receipts. Misses purchases made without the store account.
B. Company card / bank feed. Catches every purchase at every store, but only store, date and total.
C. Robot login to retailer accounts. Rejected, see above.

Chosen by the owner: A and B together. A gives the detail, B is the safety net that shows what A missed.

## Design

### 1. Job code
Every project gets a short code, made from the site address (house number, or street name when two jobs share a
number), editable, unique among open projects. The job page shows it large with one line for the crew: "At checkout,
give this as the Job Name / PO". Codes are matched case-insensitively and ignoring spaces, "#", "PO" and "JOB".

### 2. The receipts address
One address per company account, `r-<random>@in.studwise.ai`, shown under Me > Receipts & cards with short set-up
steps for Home Depot Pro Xtra, Lowe's Pro, and "any other store" (an auto-forward rule in the contractor's own mail).
The crew can also email a photo of a paper receipt to the same address. Team members share the company's address.

### 3. What happens when mail arrives (server)
Resend Inbound posts to a new edge function `receipts-in`:
1. Check the webhook signature; find the account from the address; drop mail for unknown addresses.
2. Keep the original (body text, attachments) in private storage under the account's folder.
3. The AI reads it: store, date, total, tax, receipt number, last 4 of the card, the job name / PO text, and each
   line (name, quantity, unit, amount). Images and PDFs go to the same reader as snapped receipts.
4. Same store + date + total (+ receipt number when present) as an item already held: it is the same purchase, keep one.
5. Save a row in a new table `money_inbox` with a suggested project: an exact code match, else none.
Not a receipt (a promo, a shipping notice): saved as ignored, visible under "Not receipts" for 30 days.

### 4. Card and bank feed (server)
The contractor connects a company card or bank account through the bank-data provider's own hosted page, opened in
the browser. Studwise never sees the login. First choice of provider: Stripe Financial Connections, because the
Stripe account, server code and webhook already exist for billing; Plaid is the fallback if coverage or price is
worse. Price per connected account is to be confirmed before building.
New transactions arrive by webhook and are saved as `money_inbox` rows of kind `card`. Only purchases are kept
(no deposits or transfers). By default the inbox shows building-supply and hardware merchants; a switch shows all.
A card row and a receipt row are one purchase when the totals are equal, the dates are within 3 days and the store
names agree; they are joined and the receipt's detail wins. A card row with no receipt after 2 days is listed under
"No receipt yet".

### 5. In the app
- **Receipts inbox** (from Home's "Needs you today" and from Me): three lists. *Needs a job* (pick the project, one
  tap; the AI's guess first, with why), *No receipt yet* (pick the project and the kind of cost, or mark "not a job
  cost"), *Filed* (last 30 days, with Move and Undo).
- **Filing** creates the same `CostEntry` a snapped receipt creates today, in that project's money, so the buy list,
  price lessons and `projectBooks()` keep working unchanged. The inbox row then points at the cost.
- **Automatic filing**: on by default when the code matches exactly. Shown as "Filed by Studwise" with the code it
  matched, and Undo. Anything less than an exact match waits for the contractor.
- **Snap receipt** stays, and a snapped receipt joins the same duplicate check.
- **Books sheet** (new screen, from Me and from Home): one row per project with revenue (contract + change orders),
  received, materials, labor, subs, equipment, total cost, profit, margin; a totals row; filters for this month,
  quarter, year, all, and open / finished. Export CSV and share. Tapping a row opens that project's Money tab.
- **Labor** keeps coming from crew days on the schedule and from costs typed in; the sheet reads the same numbers.

### 6. Who gets it
Pro and Team plans (it uses AI on every receipt and a paid bank connection). Starter keeps snap-a-receipt.
Only the account owner can connect or remove a bank; team members can file receipts.

### 7. Privacy and terms
Terms and Privacy name Resend (incoming mail) and the bank-data provider, say what is kept (receipt contents,
purchase store / date / amount / last 4, never bank logins), and how to disconnect and delete. Connecting a bank
shows that summary first. New version dates on both documents.

### 8. Data
- `receipt_addresses` (address token -> account owner).
- `money_inbox` (owner, kind `email | photo | card`, store, date, total, tax, receipt no., card last 4, lines, job/PO
  text, suggested project, status `new | filed | ignored`, project id, cost id, joined row id, original file path).
- `bank_links` (owner, provider ids, institution name, last 4, status).
All readable and writable only by the account and its team (same `workspace_of()` rule as photos); written by the
server on arrival. The workspace JSON stays the only home of costs; the inbox is a queue in front of it.

## Order of work
1. Job codes, inbox table, inbox screen, filing, duplicate check, books sheet and CSV (testable with snapped receipts).
2. Mail in: address, `receipts-in`, set-up screen. Needs the studwise.ai domain and a Resend account.
3. Card feed: connect flow, webhook, joining with receipts, "No receipt yet". Needs the Stripe account.
4. Plan gating, Terms / Privacy, Vietnamese wording.

## Needed from the owner
- Buy studwise.ai and create the Resend account (also needed for password emails).
- Open the Stripe account under YM LLC (also needed for billing) and turn on Financial Connections.
- Forward three or four real e-receipts (Home Depot, Lowe's, any other store he uses) so the reader is built
  against real ones; check whether Ace and his lumber / supply houses email receipts.

## Left to the builder
Screen layout within the app's current style, the merchant list for "building supply", the reader's prompt, how the
code is derived when an address has no number, retry and rate limits on the two webhooks.

## My calls, not the owner's
Job code format; Resend for incoming mail; Stripe Financial Connections first with Plaid as fallback; automatic
filing only on an exact code match; 3-day / 2-day windows; Pro and Team only; CSV as the export format; pay-backs
to crew left out.
