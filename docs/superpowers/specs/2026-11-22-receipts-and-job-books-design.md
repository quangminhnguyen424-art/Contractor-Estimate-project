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

- A purchase tied to the contractor's store account shows up in Studwise with no action per purchase.
- Each one is filed to a project by the job name / PO given at the register. What cannot be placed waits in one
  inbox and takes one tap to file.
- Purchases that produced no emailed receipt can still be caught, from the store's own purchase-history file.
- One sheet: per project and all projects, revenue, cost by kind (materials, labor, subs, equipment), profit, margin.
  Export as CSV.

## Not in this work

- Logging in to a retailer's website with the contractor's password (rejected: stores passwords, breaks on site
  changes and 2-step codes, likely against retailer terms).
- An official Home Depot / Lowe's partner feed. Worth applying for once there are users; nothing here depends on it.
- Paying bills, payroll, tax filing, or replacing QuickBooks.
- Tracking money owed back to a crew member who paid out of pocket (a paper receipt still comes in by photo; the
  pay-back is a later feature).
- Any connection to a bank or card (see "Approaches"). The owner does not want Studwise to hold customers' bank or
  card information in any form.

## Must never happen

- A cost filed to the wrong job without the contractor being able to see why and move it in one tap.
- Studwise holding a bank login, a retailer password, a card number, or a link into anyone's bank account. Card
  digits printed on a receipt (last 4) are not kept either.
- Cost, labor rates or profit shown to a client or to crew.
- The same purchase counted twice (a snapped photo, an e-receipt and a line in the store file are one purchase).

## Approaches considered

A. E-receipt emails forwarded to a private Studwise address. Full line items and the job name / PO. Works for any
   store that emails receipts. Misses purchases made without the store account.
B. Company card / bank feed. Catches every purchase at every store, but only store, date and total.
C. Robot login to retailer accounts. Rejected, see above.

The owner first chose A and B together, then said he does not want Studwise to keep bank or card information, to
stay clear of lawsuits. A bank feed cannot meet that: even through a provider that keeps the logins, Studwise would
hold an access link to the account and its purchase history. So B is left out. A is built, with a safety net that
needs no bank: importing the purchase-history file the store itself gives the contractor (section 4).

## Design

### 1. Job code
Every project gets a short code, made from the site address (house number, or street name when two jobs share a
number), editable, unique among open projects. The job page shows it large with one line for the crew: "At checkout,
give this as the Job Name / PO". Codes are matched case-insensitively and ignoring spaces, "#", "PO" and "JOB".

### 2. The receipts address
One address per company account, `r-<random>@in.studwise.ai`, shown under Me > Receipts with short set-up
steps for Home Depot Pro Xtra, Lowe's Pro, and "any other store" (an auto-forward rule in the contractor's own mail).
The crew can also email a photo of a paper receipt to the same address. Team members share the company's address.

### 3. What happens when mail arrives (server)
Resend Inbound posts to a new edge function `receipts-in`:
1. Check the webhook signature; find the account from the address; drop mail for unknown addresses.
2. Keep the original (body text, attachments) in private storage under the account's folder.
3. The AI reads it: store, date, total, tax, receipt number, the job name / PO text, and each line (name, quantity,
   unit, amount). Card digits on the receipt are not read into the record. Images and PDFs go to the same reader as snapped receipts.
4. Same store + date + total (+ receipt number when present) as an item already held: it is the same purchase, keep one.
5. Save a row in a new table `money_inbox` with a suggested project: an exact code match, else none.
Not a receipt (a promo, a shipping notice): saved as ignored, visible under "Not receipts" for 30 days.

### 4. Safety net without a bank: the store's purchase-history file
Home Depot Pro Xtra lets the contractor download their purchase history (with job name / PO) as a file; Lowe's Pro
and other stores are to be checked one by one. Under Me > Receipts, "Add a purchase-history file" reads it (CSV or PDF) the same way as a receipt. Purchases
already held are skipped by the duplicate check; the rest land in the inbox. Once a month is enough to catch
anything the emails missed. The file is the contractor's own purchase record, not bank data.

### 5. In the app
- **Receipts inbox** (from Home's "Needs you today" and from Me): two lists. *Needs a job* (pick the project, one
  tap, or mark "not a job cost"; the AI's guess first, with why) and *Filed* (last 30 days, with Move and Undo).
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
Pro and Team plans (it uses AI on every receipt). Starter keeps snap-a-receipt. Team members can file receipts.

### 7. Privacy and terms
Terms and Privacy name Resend (incoming mail), say what is kept (the receipt and what was read from it: store,
date, items, amounts, job name) and what is never collected (bank logins, card numbers, bank-account links), and how
to turn the address off and delete what came in. New version dates on both documents. Subscription cards stay with
Stripe as today; Studwise never sees them.

### 8. Data
- `receipt_addresses` (address token -> account owner).
- `money_inbox` (owner, kind `email | photo | file`, store, date, total, tax, receipt no., lines, job/PO text,
  suggested project, status `new | filed | ignored`, project id, cost id, original file path). No card digits.
All readable and writable only by the account and its team (same `workspace_of()` rule as photos); written by the
server on arrival. The workspace JSON stays the only home of costs; the inbox is a queue in front of it.

## Order of work
1. Job codes, inbox table, inbox screen, filing, duplicate check, books sheet and CSV (testable with snapped receipts).
2. Mail in: address, `receipts-in`, set-up screen. Needs the studwise.ai domain and a Resend account.
3. Purchase-history file import.
4. Plan gating, Terms / Privacy, Vietnamese wording.

## Needed from the owner
- Buy studwise.ai and create the Resend account (also needed for password emails).
- Forward three or four real e-receipts (Home Depot, Lowe's, any other store he uses) and one purchase-history
  download from Pro Xtra, so the reader is built against real ones; check whether Ace and his lumber / supply
  houses email receipts.

## Left to the builder
Screen layout within the app's current style, the merchant list for "building supply", the reader's prompt, how the
code is derived when an address has no number, retry and rate limits on the two webhooks.

## My calls, not the owner's
Job code format; Resend for incoming mail; leaving the bank feed out to honor "no bank or card information";
the purchase-history file as the safety net; automatic filing only on an exact code match; Pro and Team only; CSV
as the export format; pay-backs to crew left out.
