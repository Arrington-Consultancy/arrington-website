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

## Addendum (07/09/2026): pending actions, follow-ups and two invoice modes

Tom's live report on 07/09/2026: after Ruth drafted approval #1, the
follow-up "Create it as a draft in Zoho Invoice only. Do not email it or
send it to the customer" was answered with the canned "I need the
customer email address, amount and what it is for", and "I want the
invoice sitting in drafts" was answered from Gmail evidence. Two causes,
both in the code: the invoice parser ran on every message with no notion
of an approval already waiting, so a sentence with "create" and
"invoice" in it was a new, empty invoice; and the model was handed the
bare question with no conversation history and no open approvals, so
"drafts" matched the one record that mentioned email. A third gap sat
behind both: the execute route always emailed, so there was no
draft-only action to ask for.

**What changed.**

1. **A pending-action resolver runs BEFORE the invoice parser**
   (`lib/workspace/finance/pendingAction.js`, pure). When an open
   approval exists (this conversation's own, else the owner's most
   recent open invoice draft), the sentence is read against it:
   `cancel`, `set_mode` (draft only / create and send), `amend` (new
   amount, customer, description or date, read by the SAME deterministic
   extractors as the original sentence, `invoiceIntent.extractFields`),
   `show`, and `confirm`. A sentence it does not recognise is passed on
   unchanged. **The model changes nothing**: every write to an approval
   is in the deterministic branches of the ask route, which return before
   the model is called, pinned by test.
2. **Two invoice modes on the row.** The approval payload carries
   `mode: 'draft_only' | 'create_and_send'`. A fresh "send" or "email"
   sentence is create-and-send; "create", "raise", "make" or "issue" is
   draft only (the reversible default). The execute route reads the mode
   from the stored row and passes `send: false` for a draft, using the
   same `createAndSendZohoInvoice` the Finance page form already used.
   "Draft" in an invoice context always means a Zoho Invoice draft; the
   reply says so in words.
3. **One row, revised in place.** `repo.updateOpenApproval` rewrites the
   open row's title and payload with a revision note; a decided row is
   never touched. No superseded duplicates enter the queue.
4. **Visible everywhere.** Every deterministic reply restates the pending
   action (id, fields, mode, "not yet created"). The chat card shows the
   mode and offers "Approve and create draft in Zoho" or "Approve, create
   and email" with a matching browser confirmation; it is re-rendered on
   reload. Decisions & approvals shows a mode badge, the draft, the
   matching approve control, and a mode switch
   (`POST /api/workspace/approvals/:id/invoice-mode`, mode only; fields
   cannot be edited there).
5. **The model is told the context.** `askWorkspace` now takes a bounded
   history (last 6 turns, 600 characters each) and one server-built
   sentence describing the pending action, both in the user content.
   The system prompt keeps its three-section shape and gains one rule:
   the pending line is a server fact, the workspace handles changes to it,
   and the model never supplies or guesses a customer, an amount or a
   description. Context, not records: no leg of the permission model
   moves, because the history is the owner's own words and the pending
   line is built from a row already checked against the owner's
   clearance.

**Authority, stated plainly.** No new authority. A typed "send it" on a
row already set to send is answered "nothing is carried out from a typed
sentence" and points at the approve control; execution still needs a
named person, a browser confirmation, the flag, and is spent once.
Cancelling from chat declines the row, which is the safe direction. No
Gmail scope, route or send path is touched (pinned: the ask route
references no Gmail client). Scott is untouched.

**Evidence.** `test/workspace/pendingAction.test.js` (Tom's two failing
sentences, the follow-ups he listed, ordinary questions passed through,
the prompt the model actually receives, the route order and the execute
route reading the mode from the row) and
`test/workspace/pendingActionFlow.test.js` (the original sequence and
the amend/cancel/draft/send follow-ups end to end over HTTP against a
running server, gated like the adversarial suite and declared in
`test/gatedSuites.test.js`). Run on 07/09/2026 against a freshly seeded
local database with a stub model at `ANTHROPIC_BASE_URL`: 9/9, with the
stub's log showing the history and pending line arriving on every model
turn. Full suite 955/956 on the same database; the one failure is the
Zoho authorize-URL test reacting to the dummy Zoho variables in the
shell, green without them.

### Same day, second sentence: the trigger widened, incomplete drafts kept

Tom then typed "create a test email for £2455 and send to
tomarrington@outlook.com", which never says "invoice", so it went to the
model and was refused as an email request. Now a sentence with an
amount, an email address and a create/send verb is read as an invoice
request (deterministic, still behind the card), and an incomplete draft
is kept as a pending action so the missing part can be typed on its own.
An incomplete draft cannot be approved (decide route) or carried out
(execute route): both recompute what is missing from the stored draft.
No new authority: the same approval leg, a person, a confirmation, the
flag, spent once. Pinned in the same two test files.
