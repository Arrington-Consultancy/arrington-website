# Zoho Invoice writes from the Arrington AI Workspace: governance submission (06/09/2026)

**Status:** built, flag-gated, OFF by default. Presented to ARRINGTON AI
GOVERNANCE & ASSURANCE as a controlled change before the flag is set in
production. Tom's instruction (06/09/2026): "I want to be able to create
invoices through the workspace, a simple layout where I can create a
customer, invoice the amount and the job and send it to them. I don't want
to leave the workspace."

## What changes

This is the first WRITE into a financial system from the workspace. Until
today every finance connector was read-only by construction (ANNA statement
upload, optional Xero, Zoho Invoice reads). Three human actions are added,
all against Zoho Invoice organisation 20119226503 (EU):

| Action | Zoho call | Scope | What it does |
|---|---|---|---|
| Create customer | `POST /contacts` | `ZohoInvoice.contacts.CREATE` | Adds a customer with a primary contact email |
| Create invoice | `POST /invoices` | `ZohoInvoice.invoices.CREATE` | Creates a DRAFT with one line (the job, the amount) |
| Email invoice | `POST /invoices/{id}/email` | `ZohoInvoice.invoices.CREATE` | Emails the invoice to the customer from Tom's Zoho account |

Not added, by construction and pinned by test: UPDATE, DELETE, void, mark
as paid, record a payment, refund, or any `fullaccess` scope. The registry's
`MONEY_ACTION_CLASS_NEVER_BUILT` is unchanged: an invoice asks a customer
for money; it moves none.

## Gates (all enforced in `lib/workspace/finance/zohoInvoiceClient.js`, not only in the route)

1. `ENABLE_ZOHO_INVOICE_WRITES` must be exactly `'true'`. With it unset,
   every write function throws before any network call, and the OAuth
   consent requests READ scopes only, so a token issued in the default
   state cannot write even if the flag is turned on later. Enabling is a
   deliberate two-step act: set the flag, redeploy, reconnect.
2. Workspace access (all three existing gates: flag, owner binding,
   passphrase unlock) plus `confidential` clearance, the same as every
   other finance write.
3. Human-initiated only. The single caller is
   `POST /api/workspace/finance/zoho/invoice`, reached by a person through
   the form on `/workspace/finance`. No AI path, no worker, no lane reaches
   it. Ruth cannot create an invoice.
4. Sending is a separate boolean in the request, confirmed in the browser
   with the amount and recipient shown, because the draft stays private to
   Zoho and the email is the step that reaches a customer.
5. Every action is written to `workspace_activity`
   (`zoho_customer_created`, `zoho_invoice_created`, `zoho_invoice_emailed`,
   `zoho_invoice_email_failed`). A created-but-not-emailed invoice is
   recorded as exactly that; nothing claims a send that did not happen.
6. Input validation before any call: positive amount capped at £1,000,000,
   non-empty description, valid email, existing or new customer. A Zoho
   refusal (including a 200 carrying a non-zero `code`) is surfaced with
   Zoho's message and never the access token.

## What this does NOT change

- No new source class, lane, or clearance. Ruth's reading context is
  unchanged.
- No scheduled or autonomous action. Nothing runs without a person
  pressing a button.
- Scott is untouched. No Scott module imports this client and the
  firewall tests still hold.
- The read path is unaffected by the flag: invoices and payments display
  whether or not writes are enabled.

## Evidence

`test/workspace/zohoInvoiceClient.test.js`: the write surface is exactly
three functions; every write throws with the flag off and makes no network
call; only the literal `'true'` enables; request shapes (URL, method,
JSON body, organization_id) pinned for all three writes; validation
refusals make no call; Zoho refusals surface the message and never a
token. `test/workspace/finance.test.js`: only Zoho declares write scopes,
all CREATE-class, never-built actions still refused.

Live verification (Tom, after the flag is on and the token reissued):
create a test customer, create a £10 draft, confirm it appears in the
Zoho Invoice app as a draft, then send one and confirm the email arrives.

## Rollback

Unset `ENABLE_ZOHO_INVOICE_WRITES` and redeploy: the form disappears and
every write refuses. Reconnecting afterwards issues a read-only token
again. No code change needed.
