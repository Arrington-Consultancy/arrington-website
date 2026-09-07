# Gmail connector in the Arrington AI Workspace: governance submission (07/09/2026)

**Status:** built; reads live once Tom sets the credentials; sending
flag-gated and OFF by default. Presented to ARRINGTON AI GOVERNANCE &
ASSURANCE as a controlled change, because the approved v0.1 source map
excluded email and this adds it. Tom's instruction (07/09/2026): "I'm going
to create a Gmail api we can use directly in Arrington Workspace, set
everything up and I will paste the keys into Railway."

## What changes

A new connector reads Tom's own Gmail mailbox (tom@arringtonconsultancy.com,
Google Workspace) into the workspace, and can send one plain-text message
from it when a person asks.

| Action | Gmail call | Scope | Gate |
|---|---|---|---|
| Profile and inbox counts | `GET /profile`, `GET /labels/INBOX` | `gmail.readonly` | credentials set |
| List recent messages | `GET /messages`, `GET /messages/{id}?format=metadata` | `gmail.readonly` | credentials set |
| Snapshot into the Company Brain | none (writes `workspace_records`) | none | human presses the button |
| Send a message | `POST /messages/send` | `gmail.send` | `ENABLE_GMAIL_SEND=true` AND a token issued with that scope AND a human confirms |

Not added, by construction and pinned by test: modify, delete, labels,
settings, compose or insert, drafts, or the full-mailbox scope. No message
body is ever fetched: listing requests `format=metadata` with four headers,
and the only other content is Google's own one-line snippet.

## Gates (enforced in `lib/workspace/email/gmailClient.js`, not only in the route)

1. Credentials: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`,
   Railway only. The refresh token is displayed once by the callback page
   for Tom to copy, and nothing stores it in the database or logs it.
2. `ENABLE_GMAIL_SEND` must be exactly `'true'`. With it unset,
   `sendMessage` throws before any network call, and the consent flow asks
   for the read scope only, so a token issued in the default state cannot
   send even if the flag is turned on later without a reconnect.
3. Workspace access (flag, owner binding, passphrase unlock) plus
   `confidential` clearance on every email surface, page and API alike.
4. Human-initiated only. The single caller of `sendMessage` is
   `POST /api/workspace/email/gmail/send`, reached through the form on
   `/workspace/email` after a browser confirmation. No AI path, no worker
   and no lane reaches it; a test asserts the Ask Ruth route touches
   nothing in the Gmail client.
5. Every send and every Brain update is written to `workspace_activity`.

## What reaches the Company Brain

One record, `email.summary`, source class `email`, sensitivity
`confidential`, stale after one day: the unread count and, for the 15 most
recent inbox messages, sender, subject, date and one-line snippet. No
bodies, no attachments, no addresses beyond the From line. It is written
only when a person presses "Update the Company Brain"; nothing refreshes it
on its own.

Access follows the finance precedent exactly: `email` is granted to NO
worker lane. Only `governance_assurance` (which reads every source class by
design) and Tom's own general questions via `GENERAL_SOURCE_CLASSES` reach
it. Granting it to a lane is a worker permission change reserved to Tom and
the governed route.

## Why this is a material change

- The approved v0.1 source map excluded email systems. This is the first
  time real correspondence, including third parties' names and subject
  lines, enters the workspace's record store.
- Sending is a new outward-facing authority: the workspace can, on a
  person's instruction, cause an email to leave Tom's account. It is
  bounded (plain text, one recipient, human-confirmed, flag-gated,
  audited), and it is still new.

## What is not claimed

No live call to Google has been made from the build environment (Google's
hosts are egress-blocked there). The credential flow, the reads and the
send are verified against stubbed responses that assert exactly what the
client sends. The first real request is the boot probe after Tom sets the
variables, which logs success or the failure text (never the token).

## Requested decision

1. Approve the read scope and the bounded `email.summary` record, with
   `email` held by no worker lane.
2. Decide separately whether `ENABLE_GMAIL_SEND` may be set in production.
   Until it is, the connector is read-only by construction.
