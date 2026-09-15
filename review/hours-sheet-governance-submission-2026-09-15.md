# CONTROLLED SOURCE EXPANSION: HOURS LOG (GOOGLE SHEETS), READ-ONLY

**Submitted to:** ARRINGTON AI GOVERNANCE & ASSURANCE
**Date:** 15 September 2026
**System:** Arrington AI Workspace (`/workspace`), production service `arrington-prototype`
**Status: NOT APPROVED. NOT ENABLED. Technical completion is not approval,
and this document does not grant itself one.**

---

## 0. What triggered this

On 15 September 2026 an invoice was prepared in Ask Ruth at a figure that
omitted a logged billable row (26 August, 55 minutes, £18.33). The hours
record and the invoice disagreed and nothing in the system could see both.
The invoice has since been sent and is **out of scope**: nothing in this
change reads, alters, revisits or reconciles it. This is for future
checking only.

## 1. The new source

| | |
|---|---|
| Source | Google Sheet, "CURRENT - Arrington Consultancy Log Hours Worker" |
| Spreadsheet id | `11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A` |
| Owner | tom@arringtonconsultancy.com |
| Direction | **Read only.** No write path exists in any module. |
| Source class | `hours` (new, in `lib/workspace/lanes.js`) |
| Record sensitivity | `confidential` |

The approved v0.1 source map excluded Drive and Sheets, as it excluded
email and social. This is therefore a genuine expansion of the approved
source set and is presented for review rather than treated as self
approved, following the precedent set for the Gmail connector
(`review/gmail-connector-governance-submission-2026-09-07.md`).

## 2. Purpose

Two things, and nothing else:

1. Let Tom ask the workspace what has been done for a client and how much
   billable time it came to, from the record rather than from memory.
2. When an invoice is being prepared or reviewed, compare the proposed
   amount against the logged hours and **flag any difference, naming the
   row that causes it**.

## 3. Data that becomes accessible

Per row: date, client/project code, work description, start, finish, break,
hours, billable flag, per-row rate and value where present, and the
notes/evidence column. Plus the sheet's summary block: total hours, hourly
rate and total value.

**This is commercially sensitive beyond an ordinary business record**, and
the review should weigh it as such. It contains Arrington's own charging
rate, and the notes column states in terms which entries are
stopwatch-recorded and which are **recalibrated estimates**. A client
reading that column would learn how their bill was arrived at.

## 4. Worker and lane access

- Granted to **NO worker lane**. Asserted by test, in both directions.
- `governance_assurance` reaches it only because that lane takes
  `Object.keys(SOURCE_CLASSES)` wholesale; no lane names it.
- Added to `GENERAL_SOURCE_CLASSES`, so **Tom's own general questions** are
  the only other routed path. That list is frozen at module load.
- The record is `confidential`, so the human clearance leg gates it
  independently of the routing leg. Only `owner_admin` holds that
  sensitivity today.
- A worker does **not** gain access merely because the connector exists.
  Widening `hours` to a lane is a worker-permission change and requires
  Tom plus this route.

## 5. OAuth scope and why it is not what it looks like

**Requested scope:** `https://www.googleapis.com/auth/spreadsheets.readonly`
— exactly one, read-only, asserted by test.

The instruction was explicit that pinning a spreadsheet id restricts our
application logic and not Google's authority, and that is correct. On a
normal user OAuth grant, `spreadsheets.readonly` is a **restricted** scope
conferring read access to **every spreadsheet that user can open**. Pinning
an id in source would be a constant, not a control.

**The identity is therefore a service account, not Tom.** A service account
has no Drive of its own and begins with access to nothing. It can read
exactly the files that have been shared with its address. Effective
authority is *scope INTERSECT what is shared*, and what is shared is one
sheet, shared as Viewer. The boundary is an access control list held by
Google and visible to Tom in the sheet's own sharing dialog; revocation is
unsharing, and it is immediate.

**Alternative considered and rejected for this use, recorded so the choice
is reviewable:** `drive.file` plus the Google Picker is also genuinely
per-file and is a non-sensitive scope, and `Picker.setFileIds` can now
grant a known id directly. It is the right answer for an interactive "let
the user choose a file" flow. It is the wrong shape here because it
requires a browser grant bound to a user token, for a server that reads one
fixed sheet.

**Residual risks, stated rather than buried:**

- A service account key is a long-lived credential. It lives only in
  Railway, is never logged (the boot line prints its length only), and its
  blast radius is exactly the files shared with it: one read-only sheet.
- **DOMAIN-WIDE DELEGATION MUST NOT BE ENABLED** on this service account.
  It would let the account impersonate any user in the Workspace and would
  destroy the entire argument above. This is a standing prohibition.
- If Workspace policy forbids sharing outside the organisation, sharing to
  a `*.iam.gserviceaccount.com` address may be blocked. The remedy is an
  allowlist entry for that one address, **not** domain-wide delegation.

## 6. Spreadsheet pinning

`HOURS_SHEET_ID`, defaulting to the id above. Every read is checked against
it; no caller can ask the module for a different file. This is an
application-level control **in addition to** the ACL in section 5, not
instead of it.

## 7. Feature flag and inertness

`ENABLE_WORKSPACE_HOURS` must be exactly `'true'`. With it unset:

- `readSheet()` refuses before any network call is constructed.
- The invoice path returns `null` and appends nothing.
- The boot line states the connector is inert.

Merging changes nothing. Three things must all be true before a single byte
is read: **Governance approval, the Google authorisation completed, and the
flag explicitly enabled by Tom.** Rollback is unsetting the flag; no deploy.

## 8. Logging and audit

- One boot line, `Workspace hours:`, reporting each gate separately, the
  service account by address, the private key **by length only**, and the
  pinned spreadsheet id.
- No transaction, row, work description or hours figure is ever written to
  a log line.
- The finding shown beside an invoice is stored as part of the assistant
  message in the conversation record, as every other reply is.
- No new database table. The only retained state is one in-memory copy of
  the last successful read, which dies with the process and is never
  written to the database.

## 9. Failure behaviour

Failures are classified (`auth_failed`, `permission_denied`, `rate_limited`,
`not_found`, `unreachable`, `malformed_response`, `not_configured`,
`disabled`) so an operator is never left guessing whether waiting helps.

If the sheet cannot be read, the workspace **says so**. It must never:

- invent or estimate hours (a row with no usable hours figure is reported
  as unreadable and excluded; it is never reconstructed from start and
  finish times);
- present an earlier figure as current (any answer drawn from the last
  successful read is prefixed `NOT CURRENT`, states the reason the fresh
  read failed, and states how old the figure is);
- claim it checked the sheet when it did not;
- infer a missing row;
- silently fall back to another record. It reaches no other record: the
  module requires nothing from finance, email, social, CRM or Scott, and a
  test asserts that.

## 10. Invoice comparison behaviour

On every deterministic reply carrying an invoice card (drafting, amending,
changing the mode, reviewing, confirming), the workspace reads the billable
rows for the matched client, totals the hours **itself**, applies the rate
**recorded on the sheet**, compares, and reports.

It also cross-checks its own arithmetic against the sheet's stated total
and reports a disagreement as a finding, preferring its own row-level
arithmetic and saying so.

Client matching is deliberately strict and refuses on ambiguity: where two
client codes could match one customer, no check runs. An invoice for a
client the log does not cover is silent, not a warning.

Where the figures differ, the difference is attributed to a row where that
can be done unambiguously. Where several combinations would explain it
equally, it is reported as ambiguous rather than pinned on one.

**Example output, from the real record:**

> Hours log for WSA: 27h 34m at £20.00/hour = £551.33 across 22 billable
> entries. Your draft invoice is £533.00, which is £18.33 below the logged
> total. Difference: £18.33. The difference corresponds to the 26/08/2026
> 55 minute billable entry. Nothing has been changed: the figures are both
> stated so you can decide which is right.

## 11. What the AI is explicitly forbidden from doing

- **Altering an invoice.** No module in this change holds a write path to
  an approval row. The finding is a string appended to a reply.
- **Sending an invoice.** There is no transport in any of these files.
- **Choosing between the figures.** Where they differ, both are stated and
  the decision is Tom's.
- **Writing to the sheet.** Read-only scope; no write method exists.
- **Reading any other file.** One pinned id, one shared file.
- **Reaching the Arrington Brain, other clients' files, or general Drive.**
  No Drive browsing capability is built, requested or reachable.
- **Being read by a worker lane.** See section 4.

## 12. What changes to the existing estate

Nothing is replaced. The Zoho Invoice connector, its write flag, its
CREATE-only scopes, the named-person approval, the browser confirmation and
the spend-once guard are all untouched. This is an additional evidence
source beside them.

## 13. Evidence

- `test/workspace/hoursLog.test.js`, 22 cases, covering every case named in
  the instruction. The fixture carries the real record's dates, hours, rate
  and stated totals, so the arithmetic is proved against the sheet this
  connector actually reads; the work descriptions and evidence notes are
  genericised because they should not be in a repository.
- Five properties watched red against planted defects: non-billable rows
  counted, a worker lane granted the source, a stale read left unlabelled,
  the flag ignored, and a difference left unattributed.
- Full suite on the merged tree: **1306 tests, 1303 pass, 0 fail**, 3
  skipped (the documented gated suites).
- Production behaviour verified unchanged over real HTTP with the flag
  unset: the invoice flow produced byte-for-byte the same replies and cards
  as before this change, and the boot line reported the connector inert.

## 14. Decision requested

Approval, refusal or conditions on the source expansion described above.
**Until that decision, `ENABLE_WORKSPACE_HOURS` stays unset and no Google
authorisation should be completed.**
