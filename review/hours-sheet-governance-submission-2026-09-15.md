# CONTROLLED SOURCE EXPANSION: AUTHORISED ARRINGTON DRIVE RECORDS, READ-ONLY, AND A RECEIVABLES CAPABILITY

**Submitted to:** ARRINGTON AI GOVERNANCE & ASSURANCE
**Date:** 15 September 2026
**System:** Arrington AI Workspace (`/workspace`), production service `arrington-prototype`
**Status: NOT APPROVED. NOT ENABLED. NOT MERGED. NOT DEPLOYED. No Google
authorisation has been completed. Technical completion is not approval, and
this document does not grant itself one.**

**Supersedes the first version of this submission**, which described a
connector pinned permanently to one spreadsheet id and a capability whose
only output was a comparison printed beside an invoice draft. Tom's
correction of 15 September 2026 is recorded in section 0.2.

---

## 0. What triggered this, in two stages

### 0.1 The invoice that omitted a logged row

An invoice was prepared in Ask Ruth at a figure that omitted a logged
billable row (26 August, 55 minutes, £18.33). The hours record and the
invoice disagreed and nothing in the system could see both. **That invoice
has since been sent and is out of scope**: nothing in this change reads,
alters, revisits or reconciles it.

### 0.2 The correction that reshaped the architecture

Tom, on reviewing the first build, verbatim:

> You've interpreted the immediate WSA example too narrowly. The actual
> requirement is broader: Ruth should be able to use the appropriate
> Arrington Google Drive records to tell me what I am owed and what it
> relates to.

With six example questions, which are the acceptance criteria this
submission is measured against:

1. What am I currently owed?
2. What does WSA owe me for?
3. Have I invoiced all the WSA work I've logged?
4. What work have I done that hasn't been invoiced?
5. Which clients have outstanding money?
6. What evidence in Drive supports that figure?

And three standing constraints:

> This is Arrington's private Company Brain capability, not something WSA
> staff can access.

> Don't design the architecture around one permanently pinned spreadsheet
> if that prevents Ruth from using other authorised Arrington Drive
> records later.

> Keep the security principle: Ruth gets only the minimum authorised
> Arrington records needed, with provenance and freshness, and ordinary
> workers/WSA users do not inherit that access.

### 0.3 A defect in the first build, disclosed rather than tidied away

The first build's record builder **was never called by anything except its
own test.** The source class existed, the parser existed, `npm test` was
green, and no record was ever written, so Ruth could not have answered a
single one of the six questions. It is the same class as workspace
governance finding W1 (an inert mechanism reported as working). It is
disclosed here because the evidence in section 13 is shaped around it: the
end-to-end test asserts the records **exist in the database by key and
contain the answers**, which is the only test that would have failed
against the broken version.

## 1. What is new

| | |
|---|---|
| Direction | **Read only**, on both sources. No write path exists in any module in this change. |
| New source | Authorised Arrington Drive records (a code-declared register, one entry today) |
| Existing source, newly joined | Zoho Invoice, using its **existing read scopes**. No Zoho scope changes. |
| New source class | `hours` (in `lib/workspace/lanes.js`), granted to no worker lane |
| New Company Brain records | `hours.log` (source class `hours`), `receivables.summary` (source class `finance`) |
| Record sensitivity | Both `confidential` |

## 2. The authorised-record register

`lib/workspace/drive/register.js`. **A code-declared allowlist**: adding a
record is a commit, reviewed and in git history, never a configuration
change and never runtime discovery.

**It holds exactly one entry**, per Tom's instruction of 15 September 2026
("Keep the authorised-record register deliberately narrow. For now register
only CURRENT - Arrington Consultancy Log Hours Worker. No Drive
browsing/search, no folder access and no speculative additional records."):

| Field | Value |
|---|---|
| id | `hours_log` |
| File | "CURRENT - Arrington Consultancy Log Hours Worker" (Google Sheet) |
| Spreadsheet id | `11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A` |
| Owner | tom@arringtonconsultancy.com |
| Source class | `hours` |
| Sensitivity | `confidential` |
| Sensitive because | it carries Arrington's own charging rate, and notes saying which entries are estimates rather than stopwatch time |

Each entry also declares what it is authorised to SUPPORT, so a future
reader can tell whether a new use is inside the authorised purpose or
outside it.

**THE BOUNDARY IS TWO INDEPENDENT THINGS, AND BOTH MUST HOLD:**

1. **Google's ACL.** The service account has no Drive of its own and can
   read only files Tom has shared with it, one at a time. Enforced by
   Google, visible in each file's own sharing dialog, revoked by unsharing.
2. **This register.** A file not listed is refused before a request is
   built, by `assertRegistered()`, which throws rather than returning false.

A file shared but not registered is never read. A file registered but not
shared fails honestly and says which. **Neither alone is the control; the
intersection is.**

**There is no discovery.** The connector has no `files.list`, no search and
no folder traversal, so it cannot find a file it was not told about. A test
asserts no Drive listing endpoint appears anywhere in the module.

**The override cannot widen anything.** `DRIVE_RECORD_<ID>_FILE_ID` exists
so a registered record can MOVE (a file recreated, a copy replacing it)
without a deploy. It still passes through `assertRegistered`, so a mis-set
variable cannot widen what is readable by one character. Asserted by test,
including that no network call is made.

**Registering a Google DOC would need a SECOND OAuth scope**
(`drive.readonly`, to export a document body). It is deliberately not
requested pre-emptively. The scope list is DERIVED from the kinds actually
in the register rather than declared by hand, so a Doc cannot ride in on a
scope requested for sheets.

## 3. Data that becomes accessible

Per row of the hours log: date, client/project code, work description,
start, finish, break, hours, billable flag, per-row rate and value where
present, and the notes/evidence column. Plus the sheet's summary block.

**This is commercially sensitive beyond an ordinary business record**, and
the review should weigh it as such. It contains Arrington's own charging
rate, and the notes column states which entries are stopwatch-recorded and
which are recalibrated estimates. A client reading that column would learn
how their bill was arrived at.

From Zoho, using existing read scopes: invoice number, customer, date, due
date, status, total and balance. **No new Zoho data class is reached.**

## 4. Worker and lane access

- `hours` is granted to **NO worker lane**. Asserted by test, in both
  directions.
- `governance_assurance` reaches it only because that lane takes
  `Object.keys(SOURCE_CLASSES)` wholesale; no lane names it.
- `hours` is in `GENERAL_SOURCE_CLASSES`, so **Tom's own general questions**
  are the only other routed path. That list is frozen at module load.
- Both records are `confidential`, so the human clearance leg gates them
  independently of the routing leg. Only `owner_admin` holds that
  sensitivity today.
- **WSA staff, Scott and every fictional persona reach none of it.** They
  are different systems with different tables; the module reaches no Scott
  code and a test asserts it.
- Widening `hours` to a worker lane is a worker-permission change and
  requires Tom plus this route.

`receivables.summary` is filed under `finance`, not `hours`, deliberately:
what a customer owes is a finance fact whoever asks, and filing Zoho's own
figures under a source class invented for a spreadsheet would have been
wrong. It is `confidential` either way.

## 4a. THE OPEN GOVERNANCE STOP THIS CHANGE TOUCHES

**Raised by the builder rather than waited for.** The ARRINGTON GOVERNANCE &
ASSURANCE worker handoff (read 16 September 2026) records an open bounded
STOP:

> The last inspected substantive finding is AMBER with a bounded STOP on
> inferred standing finance access... Next controlled action remains
> correction of inferred Governance standing finance access, inspection of
> the actual permission outcome and independent recheck before dependent
> finance activity resumes.

And, in the same document: *"Governance remit does not imply standing access
to banking or other sensitive source systems."*

**This change contains an instance of exactly that pattern, and it should be
decided rather than inherited.** Section 4 states that
`governance_assurance` reaches the new `hours` class "only because that lane
takes `Object.keys(SOURCE_CLASSES)` wholesale; no lane names it". That is
true, and it is also the mechanism the STOP is about: a new confidential
source class is picked up by the governance lane **automatically, because of
how that lane is written, without anyone deciding it should be**. The same
is already true of `finance` and `email`.

The builder has NOT changed it, for two reasons. It is pre-existing
structure, not something this change introduced, so altering it here would
be scope drift of the kind these reviews exist to catch. And narrowing the
governance lane is itself a worker-permission change, which is Governance's
own decision and Tom's, not the builder's.

**Three options, for the reviewer and Tom, not for the builder:**

1. **Leave it.** The governance lane keeps reading every class including
   `hours`. Defensible if that lane's remit genuinely requires it, but it
   should be recorded as a decision rather than a side effect of a
   `Object.keys()` call.
2. **Name the classes the governance lane holds explicitly**, so a new class
   joins it only when somebody adds it. This is the smallest correction and
   the one that matches the STOP's own wording.
3. **Exclude the sensitive source classes from that lane by name**
   (`finance`, `email`, `hours`), so the governance remit audits the system
   without standing access to the commercial records inside it.

**Whichever is chosen, the decision belongs in the governance record.** No
dependent finance activity is being resumed by this submission: nothing here
is enabled, and the flag stays unset regardless of the outcome above.

## 5. OAuth scope, and why it is not what it looks like

**Requested scope:** `https://www.googleapis.com/auth/spreadsheets.readonly`
- exactly one, read-only, asserted by test.

Pinning a spreadsheet id restricts our application logic and not Google's
authority. On a normal user OAuth grant, `spreadsheets.readonly` is a
**restricted** scope conferring read access to **every spreadsheet that
user can open**, which here would include the controlled Brain records and
every client file.

**The identity is therefore a service account, not Tom.** A service account
has no Drive of its own and begins with access to nothing. Effective
authority is *scope INTERSECT what is shared*, and what is shared is one
sheet, as Viewer.

**Alternative considered and rejected, recorded so the choice is
reviewable:** `drive.file` plus the Google Picker is also genuinely
per-file and is a non-sensitive scope, and `Picker.setFileIds` can grant a
known id directly. It is the right answer for an interactive "let the user
choose a file" flow. It is the wrong shape here because it requires a
browser grant bound to a user token, for a server reading one fixed sheet.

**Residual risks, stated rather than buried:**

- A service account key is a long-lived credential. It lives only in
  Railway, is never logged (the boot line prints its length only), and its
  blast radius is exactly the files shared with it.
- **DOMAIN-WIDE DELEGATION MUST NOT BE ENABLED** on this service account.
  It would let the account impersonate any user in the Workspace and would
  destroy the entire argument above. This is a standing prohibition.
- If Workspace policy forbids sharing outside the organisation, sharing to
  a `*.iam.gserviceaccount.com` address may be blocked. The remedy is an
  allowlist entry for that one address, **not** domain-wide delegation.

## 6. What the capability does

`refreshRecords()` in `lib/workspace/hours/service.js` reads both sources
and writes both records through `repo.upsertRecord`, **the same controlled
mechanism every other workspace record uses. No second write path.**

Which side is authoritative for what is the architecture, and the first
build had it backwards:

- **ZOHO is the system of record for money.** What is owed, what has been
  paid, what an invoice was for, how overdue it is. Nothing recomputes any
  of that from the hours log, and nothing treats a logged figure as money
  owed.
- **THE HOURS LOG is the record of work DONE.** It is the only source for
  what has been delivered but not yet billed. It is never a statement about
  what a customer owes.
- **THE DIFFERENCE between them is a finding**, offered as a comparison for
  a person to judge, never as an instruction and never acted on.

Two modes, and the difference is stated in every answer:

- **ROW LEVEL**, when the sheet carries an Invoice ref column (section 7):
  exactly the rows with no reference are unbilled, and they can be named.
- **TOTALS**, when it does not, which is the state today: logged value
  minus invoiced value, an arithmetic comparison and not a list of rows. It
  cannot distinguish "not invoiced yet" from "invoiced at a different
  figure", **and it says so in the record.**

Triggered by a human pressing "Update receivables" on the Finance page
(`POST /api/workspace/receivables/refresh`, behind the existing three
workspace gates plus a confidential-clearance check). **No AI path reaches
the route.**

## 7. The Invoice ref column: SPECIFIED, NOT ADDED

Per Tom's instruction ("Do not silently alter the live Google Sheet yet.
Tell me exactly what column you want added and how it will behave"),
**nothing has been changed in the sheet.** The connector is read-only and
could not add it in any case.

**What is requested:**

| | |
|---|---|
| Column heading | `Invoice ref` |
| Where | One new column at the far right of the Hours Log tab, after `Notes / evidence` |
| Type | Free text |

**How the code treats it, exactly:**

- **The heading is matched loosely**, so `Invoice ref`, `Invoice Ref`,
  `Invoice number`, `Invoice no.`, `Invoice #` and `Invoiced` all work.
  Case and surrounding spaces are ignored.
- **Blank means NOT YET INVOICED.** That row is named in the answer to "what
  work have I done that hasn't been invoiced?", with its date, minutes and
  work description.
- **Any invoice reference (e.g. `INV-000004`) means invoiced.** The value is
  not validated against Zoho and no attempt is made to match them up: it is
  Tom's statement that the row has been billed.
- **Five phrases mean deliberately not chargeable** and are excluded from
  both the billable total and the unbilled list, rather than counted as
  awaiting an invoice: `n/a`, `not billable`, `no charge`, `written off`,
  `goodwill`. Case-insensitive.
- **The column is entirely optional.** With it absent, everything works
  exactly as it does today in totals mode. Adding it to some rows and not
  others is safe: a blank is simply "not invoiced".
- **Nothing is inferred from it beyond the above.** An unrecognised value is
  treated as an invoice reference, never as an error and never as a reason
  to exclude a row silently.

**What it changes for Tom:** question 3 ("have I invoiced all the WSA work
I've logged?") and question 4 ("what work have I done that hasn't been
invoiced?") go from an arithmetic difference to a named list of rows. That
is the difference between "£68.33 unaccounted for" and "the 26 August 55
minute Library PDFs entry and the 11 September 150 minute portal entry have
not been invoiced".

**It is Tom's decision and Tom's edit.** Approval of this submission does
not authorise anything in the sheet to change.

## 8. Feature flag and inertness

`ENABLE_WORKSPACE_DRIVE_RECORDS` must be exactly `'true'`. With it unset:

- `readRecord()` refuses before any network call is constructed.
- The invoice check path returns `null` and appends nothing.
- The receivables refresh still writes its record, saying honestly that the
  unbilled side is unavailable, because Zoho answering alone is a real and
  useful answer, and writing nothing would leave an older record standing
  that claims otherwise.
- The boot line states the connector is inert.

Merging changes nothing about what is read from Google. **Three things must
all be true before a single byte is read from Drive: Governance approval,
the Google authorisation completed, and the flag explicitly enabled by
Tom.** Rollback is unsetting the flag; no deploy.

The Zoho half uses credentials already present and already approved.

## 9. Logging and audit

- One boot line, `Workspace Drive records:`, reporting each gate
  separately, the service account by address, the private key **by length
  only**, the records in the register and the scopes they require.
- No transaction, row, work description, client name or hours figure is
  ever written to a log line.
- Each refresh writes a `receivables_brain_synced` row to
  `workspace_activity`, naming the actor and which records were written.
- The two Company Brain records are ordinary `workspace_records` rows,
  subject to the same freshness, clearance and filtering machinery as every
  other record. Both carry `stale_after_days = 1`.
- The in-memory copy of the last successful read dies with the process and
  is never written to the database.

## 10. Failure behaviour

Failures are classified (`auth_failed`, `permission_denied`, `rate_limited`,
`not_found`, `unreachable`, `malformed_response`, `not_configured`,
`disabled`, `not_registered`) so an operator is never left guessing whether
waiting helps.

The workspace **says what it could not read**. It must never:

- invent or estimate hours (a row with no usable hours figure is reported
  as unreadable and excluded; it is never reconstructed from start and
  finish times);
- present an earlier figure as current (any answer drawn from the last
  successful read is prefixed `NOT CURRENT`, states why the fresh read
  failed, and states how old the figure is);
- claim it checked a source when it did not;
- report a missing source as zero. Asserted by test: with the hours log
  unreadable the record says "WORK DONE BUT NOT INVOICED: unavailable" and
  contains no unbilled figure at all;
- let one source stand in for the other. Zoho answers for money, the hours
  log answers for work done, and a missing one is reported as missing;
- print a negative money figure. "More has been invoiced than the log
  accounts for" is stated in those words, because "-£646.67 logged and not
  invoiced" is a sentence with no meaning.

A record written with one source missing carries `sync_outcome = 'partial'`,
so the freshness machinery can say so without reading the body.

## 11. What the AI is explicitly forbidden from doing

- **Altering or sending an invoice.** No module in this change holds a write
  path to an approval row, and none reaches a Zoho write function. Asserted
  by enumerating every `zohoClient.*` call in the service and requiring the
  set to be exactly `getAccessToken` and `getInvoices`.
- **Writing to the sheet.** Read-only scope; no write method exists.
- **Writing anything but a Company Brain record.** Asserted by enumerating
  every `repo.*` call and requiring the set to be exactly `upsertRecord`.
- **Reading any unregistered file**, or discovering one. Section 2.
- **Choosing between the figures.** Where they differ, both are stated and
  the decision is Tom's.
- **Being read by a worker lane, by WSA staff, or by Scott.** Section 4.

## 12. What changes to the existing estate

Nothing is replaced. The Zoho Invoice connector, its write flag, its
CREATE-only scopes, the named-person approval, the browser confirmation and
the spend-once guard are all untouched. `ENABLE_ZOHO_INVOICE_WRITES` is not
read by anything in this change.

## 13. Evidence

- `test/workspace/hoursLog.test.js`, 26 cases: the parser and its
  arithmetic against the real record's dates, hours, rate and stated totals;
  the invoice check; the register; the connector's gates and failure
  classification; and the read-only/no-discovery boundary. The work
  descriptions and evidence notes in the fixture are genericised, because
  they name client deliverables and say which entries are estimates.
- `test/workspace/receivables.test.js`, 13 cases: the Zoho side (drafts not
  owed, voids excluded, Zoho's own balance trusted, overdue ageing), both
  unbilled modes, the refusals, and **an end-to-end case that runs the real
  refresh against a real database and asserts the records exist by key and
  contain the answer to each of Tom's six questions.**
- **Eight properties watched red against planted defects**, and one of them
  found a defect in the TEST rather than the code: the end-to-end case
  originally passed against a refresh that wrote nothing, because a row left
  by an earlier run satisfied "the record exists". It now clears both rows
  first and asserts each was written by that refresh. The other seven, each
  red on the property it is named for: drafts counted as owed; a negative
  money figure printed; a missing hours log reported as nil; a Zoho zero
  printed for a source that was not read; a failure reason nested inside its
  own sentence; rows named when the sheet cannot support it; and the
  register accepting an unregistered file.
- **Two defects were found by RUNNING the route over real HTTP rather than
  by reading it**, and both were honesty defects in the record Ruth would
  have answered from. With Zoho unreadable the record printed "OUTSTANDING:
  GBP 0.00 across 0 open invoice(s)", stating that nothing was owed when
  nothing was known: the rule already enforced for the hours log, missing on
  the money side, which is the side that matters more. And a failure reason
  was interpolated as a whole sentence, giving "could not be read (The hours
  log could not be read (...))". Both fixed, both now pinned.
- Full suite on a genuinely fresh database: **1320 pass, 0 fail**, 3 skipped,
  with the eight documented gated suites named on the run.
- The Finance page and the refresh route were exercised over real HTTP
  against a local instance as `tom`, logged in and unlocked: the page returns
  200 with no inline `style="` attribute (the CSP trap that has broken this
  view twice), and the route returns 200 and writes an honest degraded
  record with both sources unavailable, carrying no figure for either.

**Not proven, and stated as such:** no live Google call has been made. This
sandbox cannot reach the live service, the service account does not exist
yet, and the sheet has not been shared with anything. The first real read
will be Tom's, after approval. Nothing here should be read as evidence that
the Google side works.

## 14. Decision requested

Approval, refusal or conditions on:

1. the authorised Drive record source expansion (sections 2, 3, 5);
2. the `hours` source class and its general-lane-only routing (section 4);
3. the two new Company Brain records and the human-triggered refresh that
   writes them (section 6);
4. separately, and at Tom's discretion rather than Governance's, the
   Invoice ref column specified in section 7.

**Until that decision, `ENABLE_WORKSPACE_DRIVE_RECORDS` stays unset, no
Google authorisation is completed, no service account is created, and the
branch is not merged or deployed.**
