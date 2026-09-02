# Scott AI Demonstration — Banking & Accounting

## Controlled change submission to Governance & Assurance

**Date:** 01/09/2026
**Raised by:** the builder, on Tom's instruction of 01/09/2026
**Status:** submitted, not self-approved
**Branch:** `claude/pembroke-diagnosis-review-3z8iw9` (not on `main`, not deployed)

---

## 1. Why this needs Governance at all

The approved v0.2 source map and the doc 24 review cover Scott as a system
that **reads** a fictional company and drafts things for a human to decide.
Two properties of this change fall outside that:

1. **A human action now changes the company's authoritative financial
   state.** Raising an invoice, recording a supplier bill, categorising a
   bank line and posting a journal each write to a persistent ledger that
   the AI subsequently reasons from. Until now the only mutable state a
   human could reach was a job's status, an enquiry's assignment and a
   Brain Gap's resolution. None of those were financial.
2. **Six new action authorities exist.** They grant no clearance anybody
   did not already hold, but they are new rights to act, and the rule this
   system operates by is that a new right to act is Governance's to
   confirm, not the builder's.

This submission does not claim a verdict. It sets out what was built, what
was deliberately refused, what was tested, and the two things reserved to
Tom.

## 2. What was built

`/scott/finance`, replacing the separate Finance and Banking nav items, with
thirteen tabs: Overview, Bank Accounts, Transactions, Reconciliation,
Sales & Invoices, Bills & Expenses, Cashflow, Profit & Loss, Balance Sheet,
VAT, Reports, Finance AI (Nigel Preece) and Approvals & Audit.

Underneath it is a real double-entry ledger in four tables. Every report is
a projection over journal lines rather than a stored figure, so the profit
and loss, the balance sheet, the VAT return and the aged debtor list cannot
disagree with each other. That is a governance property as much as a
technical one: a fictional company that answers the same question two ways
in front of a prospect is the failure this demonstration cannot survive.

## 3. What is refused, and how

Unchanged from the reviewed `lib/scott/banking.js`, and re-asserted by test:

- Eight actions are refused **by construction**, throwing rather than
  returning false: make payment, transfer between accounts, add or change
  payee, set up standing order, amend direct debit, draw on overdraft,
  change bank credentials, export full statement externally.
- **No bank connector, no credential, no card, no payment rail, no Stripe
  object and no Arrington banking data** exists anywhere in this area. The
  connection state reports `not_connected` and says why, rather than
  implying a sync that has not run.
- The only route that touches paying anybody, `payment-request`, writes a
  record into the existing human approvals queue and **executes nothing**.
  It calls `assertBankingActionRefused('make_payment')` on the way, so if a
  later edit ever wires it to something that moves money, it throws.

## 4. The permission model

**No new clearance domain was created.** Every account in the chart of
accounts carries one of three domains that already existed
(`finance_full`, `director_position`, `invoice_status`), read by the
existing `clearance.filterAndRedact`. This area therefore grants nobody
visibility of anything they could not already see.

The six new entries in `ACTION_DOMAINS`, each derived from the standing
rule that acting on a record requires the clearance to see it:

| Action | Requires | Who holds it |
|---|---|---|
| `invoice_create` | `invoice_status` | Scott Mercer, Chloe Reed |
| `bill_record` | `finance_full` | Scott Mercer |
| `bank_categorise` | `finance_full` | Scott Mercer |
| `receipt_allocate` | `finance_full` | Scott Mercer |
| `journal_post` | `finance_full` | Scott Mercer |
| `payment_request` | `finance_full` | Scott Mercer |
| `writeback_payment_release` | `finance_full` | Scott Mercer |

`bill_record` is deliberately `finance_full` and not `invoice_status`.
07Q Clearance C covers "routine invoice and payment status" and explicitly
excludes "detailed supplier cost/margin", so the sales ledger is Chloe's
and the purchase ledger is not. The purchase ledger also carries the trade
creditors control account, which states what the company owes.

**Segregation of duties is the demonstration, not a description of one.**
The person who raises the invoices cannot see the account they will be paid
into. The operations lead can see whether committed payments can go out and
cannot see a balance, a headroom figure or the borrowing position.

## 5. A distinction Governance should test directly

**Coding a document to an account is not reading that account's balance.**
The sales-invoice form and its endpoint check the account's GROUP but not
its domain, so Chloe can pick a service line for each invoice while turnover,
gross profit and the sales account balance remain invisible to her, exactly
as a sales ledger clerk works in a real company. The group restriction is
what prevents an invoice being coded to the director's loan account or a
bank account.

This is the one place where a write is authorised on something other than
"can this person see it", and it is stated here rather than left to be
discovered. If Governance judges it wrong, the fix is one flag and Chloe
loses the ability to raise invoices.

## 6. Defects found during the build, disclosed rather than tidied

All three were found by testing, not by reading, and all three are fixed
with a case pinning each:

1. **A real leak.** The Bills tab showed Chloe the trade creditors control
   total, a company position figure her clearance excludes. Found by a
   canary sweep of all thirteen rendered tabs as all eight personas.
2. **An over-correction of the same rule** left the only person who raises
   invoices unable to raise one, by requiring clearance to READ an account
   in order to CODE to it (section 5).
3. **A prototype-chain defect in `clearance.personaCanAct`.** An action
   name of `constructor` resolved through `Object.prototype` to a truthy
   value, and a persona holding `'*'` was then told they could perform it.
   Not reachable today (every call site passes a literal), but it is the
   same shape as Workspace governance finding T3. `ACTION_DOMAINS` is now
   null-prototype with a `hasOwn` guard.

## 7. Two contradictions inside the controlled record

Surfaced, not silently corrected. **Both are Tom's to decide**, and the
system currently shows the ledger's own internally consistent figures:

1. **07A's VAT working estimate (GBP 8,750 for a quarter) does not
   reconcile with 07A's own turnover.** At GBP 47,600 a month with the
   stated cost mix, the computed liability is materially higher, and the
   reserve of GBP 9,400 is set at roughly the estimate rather than at the
   liability. The VAT tab presents this as the company under-reserving,
   which is believable and commercially interesting rather than a defect.
2. **07A's two named largest debtors exceed the ageing bucket they both
   fall in.** Moorland Holiday Lets (GBP 3,600, 43 days) and Devon Hearth
   Cafe Group (GBP 1,950, 36 days) total GBP 5,550 against a stated
   31-to-60 day figure of GBP 5,100. The named invoices are honoured
   exactly, the other three buckets match 07A exactly, and the GBP 450 falls
   into the current bucket, which 07A does not itemise.

Separately, the banking figures authored on 01/09/2026 in `banking.js`
contradicted 07A on the bank balance, the VAT reserve and the VAT quarter,
and **both sets were in the company brain at once**. They have been removed.
`BANKING_CONTROLS` stays, because those are rules rather than figures.

## 8. Evidence

- **Full suite: 687 tests, 685 pass, 0 fail, 2 skipped** (the two
  credential-gated suites), against a real PostgreSQL 16 database.
- **38 new tests**: `test/scott/financeLedger.test.js` (22),
  `test/scott/financeClearance.test.js` (16). Every clearance case carries a
  positive control, because a test that only asserts absence passes against
  a system that shows nobody anything.
- **Canon reproduction, by test:** the derived monthly profit and loss
  reproduces all five months of 07A exactly; the bank, VAT reserve, debtor,
  creditor, director's loan, term loan and equipment finance balances land
  on canon to the penny; the sub-ledgers agree with their control accounts.
- **Idempotency:** three consecutive seeds on a fresh database leave 23
  journals, 21 documents and 9 bank lines.
- **Boundary sweep:** all thirteen tabs fetched as all eight fictional staff
  over real authenticated sessions, checked for seven restricted figures.
  Zero leaks for the seven non-owner personas; the owner sees all seven,
  which is the positive control proving the canaries are findable.
- **Persistence and AI authority:** an invoice raised by Chloe moved the
  debtor book from GBP 31,400 to GBP 32,900; a bank line categorised by
  Scott moved the bank balance and the unexplained count. Both were still
  present, and still what the AI is handed, in a cold process after a full
  restart.
- **Refusals, over real sessions:** Tony Marsh refused 403 on invoice and
  journal; Chloe refused 403 on bank categorisation; an unbalanced journal
  refused with the difference named.

## 9. What has NOT been done

- **Not deployed.** This is on a branch. Production is untouched, and the
  standing instruction not to restart the app while an invited viewer may
  be using it is being observed.
- **Not reviewed by anybody but its builder.** That is what this document
  asks for.
- **The live-AI behaviour of this area has not been exercised against the
  real model.** `ENABLE_SCOTT_AI` is on in production but the paid pressure
  suite has not been re-run for the finance records, so the claim that Nigel
  reasons from the live ledger rests on what he is HANDED (verified) and not
  on what he then says about it (not verified). A re-run with a fresh run
  label is the honest way to close that.
- **Nothing in the controlled record was edited.** The two contradictions in
  section 7 are reported for a human decision.
