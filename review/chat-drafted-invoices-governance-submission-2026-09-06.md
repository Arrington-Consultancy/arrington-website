# Chat-drafted invoices, two systems: governance submission (06/09/2026)

**Status:** built, tested, presented for the existing approval gate before
production. Tom's instructions (06/09/2026): "I think the chat bot should
be able to send an invoice" (Scott), then "build the same thing in
Arrington workspace. I want to type in: send an invoice to
tomarrington@outlook.com £500 for mini commercial review as of today".

The same shape on both sides, and the same principle preserved on both:
**the chat drafts, a named human decides, and only the decision carries
anything out.** No model is given authority to post or send. In fact no
model is involved in reading the sentence at all: both readers are
deterministic parsers, because a figure that will enter the books, or an
invoice that will be emailed to a real address, must be built from what
the person typed and nothing inferred.

## Arrington AI Workspace (real money, real Zoho, real email)

Files: `lib/workspace/finance/invoiceIntent.js` (pure parser),
`routes/workspace.js` (`/api/workspace/ask` branch,
`POST /api/workspace/finance/zoho/invoice/execute`,
`createAndSendZohoInvoice` shared with the Finance page form),
`lib/workspace/repo.js` (`getApproval`), `views/workspace/chat.ejs`
(draft card), `views/workspace/approvals.ejs` ("Approve and send").

Flow:
1. Ask Ruth receives "send an invoice to <email> £<amount> for <job> as
   of today". The parser reads email, amount, description and date. If
   any is missing, the reply names it and nothing is created. Ruth writes
   no handoff note: no lane read a record.
2. A complete sentence becomes a row in Decisions & approvals
   (`Zoho invoice: ...`, action class 2, sensitivity confidential), with
   the draft stored on the row. Nothing is created in Zoho at this point.
3. A named person approves it (chat card or approvals page).
4. The execute route re-reads the approval from the database, refuses
   unless status is `approved` and `decided_by` is a named person (never
   `workspace_ai`), refuses unless the row is a Zoho draft, and refuses a
   second execution (activity row `zoho_invoice_executed` keyed on
   `approval:<id>`). Only then does it call the existing, flag-gated,
   CREATE-only Zoho client: reuse or create the customer, create the
   invoice, email it. The draft executed is the one stored on the row
   the person read, never the request body.

Gates unchanged from the earlier write capability: `ENABLE_ZOHO_INVOICE_WRITES`
exactly `'true'`, workspace access (three gates), confidential
clearance, CREATE-only scopes, every action recorded. New here: the
approval leg, re-read and spent once, identical in shape to the social
mutations gate.

## Scott demonstration (fictional ledger, nothing leaves)

Files: `lib/scott/finance/invoiceIntent.js` (pure parser, written
independently; the firewall between the two systems is untouched and
tested), `routes/scott.js` (`/api/scott/messages` branch, decide route),
`views/scott/approvals.ejs`.

Flow:
1. A complete "send an invoice to <customer> £<amount> for <job>" from a
   persona holding `invoice_status` is drafted under Nigel Preece's name
   into `scott_writebacks` as `invoice_raise`, `pending_approval`. Nigel's
   reply says it is drafted, that he does not issue invoices, and that it
   waits in Approvals. The AI turn is skipped: no model call, no cost.
   An incomplete sentence, or a persona without sales-ledger clearance,
   goes to the AI turn exactly as before (Nigel asks, or refuses).
2. Approvals shows it with an **Issue invoice** control. Deciding it needs
   `invoice_create`, the same authority as raising an invoice on the
   Sales tab (Scott Mercer, Chloe Reed).
3. Approval posts the sales invoice to the ledger through the same
   validated, balanced journal the Sales tab uses, from a machine-readable
   line on the approval row that the person read. A failure after
   approval is recorded as `finance_invoice_issue_failed`, never as
   issued.

Nothing here reaches Arrington's Zoho, accounting records, a real
customer, a real email address or a payment system; the Scott parser
names none of them and imports nothing, by test. The one demonstration
invoice (`SAKS-DEMO-0001`) is unchanged and still cannot be sent.

## Worker authority, stated plainly

- Nigel gains no authority. The parser is not Nigel; it is code that
  runs before Nigel. The writeback is a record that executes nothing.
  The posting is a human's act, gated on `invoice_create`.
- Ruth gains no authority and reads no record; she is not called on the
  drafting path.
- No lane, worker or model can create, post, send or email an invoice on
  either system. Every consequential step is behind a named human
  decision re-read from the database.

## Evidence

`test/workspace/invoiceIntent.test.js` (Tom's exact sentence, the
customer-name form, non-requests, missing pieces named, four date forms,
purity), `test/scott/invoiceIntent.test.js` (draft, "for me" incomplete,
non-requests, encode/decode round trip and tamper refusal, purity, the
route structure: drafting under Nigel, `invoice_create` on decide, and
no posting path before the decide route). Existing suites unaffected:
Zoho client, finance registry, demo invoice, Scott/workspace firewall,
finance clearance, em dashes, gated suites. 123/123 on the combined run.

## Rollback

Workspace: unset `ENABLE_ZOHO_INVOICE_WRITES` (drafts still queue as
records; execution refuses). Scott: reject the draft in Approvals; or
revert the commit, which removes the branch and the decide extension
together.
