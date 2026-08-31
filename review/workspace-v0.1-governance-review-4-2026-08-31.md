# Arrington AI Workspace v0.1: Independent Governance & Assurance Review (fourth pass)

Date: 31 August 2026
Lane: ARRINGTON GOVERNANCE & ASSURANCE, acting as the independent assurance lane.
Release candidate reviewed: branch `feature/arrington-ai-workspace-v0-1`, frozen head
`80eff45f4d18320c3d499cee9d7d1e023f4013a6`.
Baselines: the three previous reviews (`workspace-v0.1-governance-review-2026-08-30.md`, AMBER,
F1-F10; `workspace-v0.1-governance-review-2026-08-31.md`, AMBER, G1-G9;
`workspace-v0.1-governance-review-3-2026-08-31.md`, AMBER, H1-H7) and the builder's three
responses, the most recent being `workspace-v0.1-h-remediation-2026-08-31.md`.

`git rev-parse HEAD` returned `80eff45f4d18320c3d499cee9d7d1e023f4013a6` and
`git status --porcelain` returned nothing, at the start of this session and again at the end. I
reviewed that commit and nothing else. I made no change to the branch source, and this review is
committed on a separate branch.

## 1. The bounded question

Have the seven findings of the third review been closed, and — the specific question this pass was
commissioned to answer — **does a fourth instance exist of the pattern that produced the previous
three AMBER verdicts: a security property asserted in a comment or a document that does not hold in
the code?** Nothing more. This review does not authorise a merge, a deploy, an environment variable
change, a spend, or the connection of any external account, and it did none of those things.

## 2. VERDICT: AMBER

**AMBER.** All seven H findings are closed and I verified each against the builder's own claims
rather than reading them; F1 and G1 remain closed under a fresh, independent sweep. But **a fourth
instance of the pattern does exist**, in the same module and the same numbered rule list as the two
it was written to fix: `lib/workspace/unlockAlert.js` states as Rule 2 that the alert is "BOUNDED.
One alert per cooldown window, no matter how many attempts arrive", and it is not — the cooldown is
an unsynchronised read-then-write, and I produced five delivered messages from five concurrent
calls and two from one burst through the real HTTP endpoint. A test named "a guessing loop produces
one alert, not a flood" asserts that property in its title and does not exercise it.

This is materially the strongest state the candidate has been in. **Nothing found in this pass
grants access, leaks restricted business data, executes a consequential action, or self-grants any
authority. Every preventive gate held against everything I could throw at it.** Four findings: one
MEDIUM, three LOW, no HIGH — the first pass in four with no HIGH finding. The distance between this
AMBER and a PASS is one bounded defect in a detection control and some wording.

## 3. Independence, and its limits

I am a separate session from the technical builder. I did not write any of the workspace code, and
I accepted no claim I could test myself.

Four limits, stated rather than buried:

1. **I am a Claude agent, commissioned by the builder's own session, reviewing the builder's work.**
   That is a structural weakness in this arrangement and it is not cured by my having found things.
   All three previous reviews recorded it; it is unresolved after four passes, and it is the single
   thing about this assurance chain that most deserves Tom's attention.
2. **No network access to Railway or to the live site.** Everything about production and staging
   variables, deployments and the paid live-AI run is reported, not verified. Listed in section 5.
3. **No Google Drive access.** The controlled authorities, the approved source map and Tom's own
   instructions reach me only as transcribed by the party they constrain.
4. **No real browser.** I drove the application over HTTP and inspected status, headers, bodies,
   cookies and timing. I did not render a page.

## 4. What I verified, with observed results

Environment: local Postgres 16 (`ws_test`); the working tree unmodified at `80eff45`; a server on
port 3014 with `ENABLE_ARRINGTON_AI_WORKSPACE=true`, `WORKSPACE_OWNER_USERNAME=tom`,
`WORKSPACE_OWNER_USER_ID=2` and a 32-character `WORKSPACE_ACCESS_PASSPHRASE`; and a second server
on port 3015 with **no workspace variables at all**, which is production's configuration if this
branch merges.

### 4.1 The regression suite

```
DATABASE_URL=... SESSION_SECRET=... npm test
# tests 522   # pass 520   # fail 0   # skipped 2   # duration_ms 155582
EXIT=0
```

Five entries carry a `# SKIP` directive while the summary counts two: Scott adversarial, Scott paid
AI, the Websites-and-AI two-pass seed, `test/workspace/adversarialApi.test.js`, and the workspace
paid AI. **The warning carried by all three previous reviews stands unchanged: a bare `npm test`
does not exercise the workspace HTTP surface.**

### 4.2 The builder's adversarial suite, armed

```
WORKSPACE_TEST_BASE_URL=http://localhost:3014 ... node --test test/workspace/adversarialApi.test.js
# tests 9   # pass 9   # fail 0   # skipped 0
```

8 checks, all genuinely executed, including the post-unlock half.

### 4.3 G1 stayed closed. I could not find a workspace-specific signal anywhere

I wrote my own probe rather than trusting the builder's. It compares **status, every response
header except a named volatile set, the nonce-normalised body, and Set-Cookie** against a control
path that genuinely does not exist, across three `Accept` values (`text/html`,
`application/json`, `*/*`), for sixteen page paths (including `/workspace/`, `/WORKSPACE`,
`/workspace/unlock`, `/workspace/nonsense`, `/workspace/contacts?x=1`) and the workspace API
endpoints.

```
== ANONYMOUS, flag OFF (port 3015, production's config on merge) ==
anon: 75/75 identical to control        (repeated: 75/75 identical to control)
== NAT (admin, authenticated, NOT the owner), flag ON (port 3014) ==
nat login -> 302 /   nat authenticated (GET /api/admin/users): 200
nat: 69/69 identical to control
```

Not one probe differed in status, in any non-volatile header, or in body. Other channels:

```
methods   HEAD/OPTIONS/PUT/DELETE/PATCH: /workspace and control identical (404/404/500/500/500),
          hdrsame=true on every one
cookies   only _csrf, set identically on workspace denials and on the control
timing    flag off:  /workspace 3.7ms   /workspace/nonsense 3.6ms   control 4.0ms  (median of 25)
          flag on:   /workspace 4.4ms   /workspace/nonsense 4.0ms   control 4.8ms
sitemap   mentions workspace: false        robots.txt mentions workspace: false
```

`setNoindex` is a plain function called only after the access decision, is not exported as
middleware, and no denial carried `X-Robots-Tag`. **On this evidence merging remains inert.**

### 4.4 F1 stayed closed. The takeover, replayed

As `nat` (role admin), against the running server:

```
/workspace, /workspace/contacts, /workspace/unlock      -> identical to control (404)
PUT /api/admin/user/2/password {"password":"SeizedByNat!99"}  -> 200 {"success":true}
```

The legitimate recovery route is intact, as Tom required. Then as the seized `tom`:

```
login as seized tom                          -> 302 /
/workspace, /contacts, /brain, /activity     -> 302 /workspace/unlock, 39 bytes, no content
POST /api/workspace/ask                      -> 404, mentions-unlock=false
POST /api/workspace/contacts/1/erase         -> 404, mentions-unlock=false
wrong passphrase x5                          -> 401 (17, 7, 6, 7, 5 ms)
attempt 6                                    -> 429 "Too many attempts. Wait fifteen minutes."
```

I restored the local `tom` password afterwards and confirmed it by logging in again.

I also re-checked the second factor's own stated properties directly:

```
after rotating WORKSPACE_ACCESS_PASSPHRASE, an open unlock is still valid: false
unlock presented under a different user id:                              false
unlock 5 hours old (TTL 4h):                                            false
```

All three hold.

### 4.5 H1 closed. The recipient is genuinely out of CMS reach

Replaying the third reviewer's own demonstration against the real database and the running app:

```
PUT /api/content {"fields":[{"key":"contact.email","content":"attacker@evil.example"}]} -> 200
contact.email in DB : attacker@evil.example
alertRecipient()    : tom@arringtonconsultancy.com      <- NOT retargeted
alertRecipient.length (parameter count): 0              <- takes no database handle
with WORKSPACE_ALERT_EMAIL set: security@example.test   (trimmed correctly)
```

I then searched for any other route by which a CMS-writable value reaches a workspace security
decision. `grep -rn "FROM content\|section_key" lib/workspace/ lib/crm/ routes/workspace.js`
returns **nothing**, and every `process.env` read in `lib/workspace/**` is an infrastructure
variable. The username that appears in the message body is `req.session.user.username`, which is
pinned to the owner binding, so it is not attacker-chosen either. **H1 is closed, and closed at the
class level rather than at the one instance.** I restored `contact.email` and verified the restore.

### 4.6 H2 closed. A failed send no longer takes the budget

This one occurred by itself again, in the real database, through the real endpoint, during the F1
replay above — and this time it behaved correctly:

```
id | actor  | event_type                    | time
74 | tom    | workspace_unlock_failed       | 05:52:13
75 | system | workspace_unlock_alert_FAILED | 05:52:13   "email is not configured..."
76 | tom    | workspace_unlock_failed       | 05:52:13
77-79 | tom  | workspace_unlock_failed      | 05:52:13
```

The undelivered notice was recorded under `workspace_unlock_alert_failed`, not under the success
event, so it did not start the sixty-minute cooldown. End to end, with the real `defaultSend`:

```
phase1 (GMAIL_APP_PASSWORD unset): {"sent":false,"error":"email is not configured..."}
  [failure row back-dated past the 5-minute backoff]
phase2 (mail working):             {"sent":true}   delivered: 1
-> the alarm can still ring once mail is fixed: YES
recorded: alert_failed x1, alert_sent x1
```

And the arithmetic, on the pure function:

```
failed 1 min ago      -> quiet: "the last notice FAILED to send 1 minute(s) ago; retrying after 5"
failed 6 min ago      -> ALERT
delivered 59 min ago  -> quiet: "a notice was DELIVERED 59 minute(s) ago; cooldown is 60"
delivered 61 min ago  -> ALERT
```

The reason strings are now worded from recorded state and no longer claim a send that did not
happen. **H2 is closed.**

### 4.7 H3, H4, H5, H7

- **H3.** Observed on a real boot, flag on:
  `Workspace access: flag on | owner binding ok (username 'tom', expects user id 2) |
  WORKSPACE_ACCESS_PASSPHRASE set, length 32 | failed-unlock alert CANNOT be sent:
  GMAIL_APP_PASSWORD is unset. The alarm is inert in this environment. It would otherwise go to
  tom@arringtonconsultancy.com | actual ids in this database: tom=2 | RESULT: the cleared owner can
  unlock`. With the flag off the line correctly says only that the workspace does not exist and
  prints no address. Both variables are in `CLAUDE.md`'s deployment list (lines 715-716) with the
  H1 reasoning attached. Corrected.
- **H4.** `ACTIVITY_SENSITIVITY = 'confidential'` is declared once and read at both call sites
  (`routes/workspace.js:160`, `:307`). I looked for a third surface and there is none:
  `repo.listActivity` has exactly those two callers, no view outside `today.ejs` and `activity.ejs`
  renders activity rows, `navCounts` reads only gaps and approvals, and the AI orchestrator reads
  `repo.listRecords` only and never touches `workspace_activity`. Corrected.
- **H5.** Verified behaviourally, not by reading: with a DELIVERED row present for `"tom"`, a
  burst for `tom` is silenced and a burst for a different account `nat` alerts. Corrected — but see
  J2 for how it is implemented.
- **H7.** `ALERT_FIELDS` is `username, failures, windowMinutes, firstAt, lastAt`, and the guard is
  real, not a `.length` convention: `buildAlert({..., recentRecordTitles:['secret deal']})` threw
  `buildAlert received field(s) it is not permitted to read: recentRecordTitles`. The message body
  carries no passphrase, no length pattern and nothing from inside. Corrected.

### 4.8 Scope

`git diff --stat be9e675..80eff45` touches nine files: `CLAUDE.md`, the two new review documents,
`lib/workspace/unlockAlert.js`, `routes/workspace.js`, `server.js` and three test files. The
`server.js` change is eight lines adding the H3 boot clause; the `routes/workspace.js` change is
the H4 shared constant. **There is no undisclosed source change since the third review, and nothing
touching a live surface.**

## 5. What I accepted as reported, and from whom

- **Everything about Railway.** That production carries no workspace variables, that the staging
  service exists, that any named deployment happened. From the builder. In particular I cannot see
  whether `GMAIL_APP_PASSWORD` or `WORKSPACE_ALERT_EMAIL` is set on whichever service would run the
  workspace, which is what H1 and H3 turn on.
- **The paid live-AI run `ws-20260831-c`.** From the builder. Not replayable here, and I spent
  nothing.
- **Tom's decisions** (F1 option 3, the F3 approval, the G3 approval, the G6 alert instruction, the
  bounded paid-run authorisation) as quoted in the remediation documents. An assurance lane reading
  an instruction transcribed by the party it constrains is a weak link. This is the fourth review to
  record it.
- **The controlled Drive authorities**, the nine-lane register, and the provenance and
  classification of the records in the encrypted snapshot. See J4 for a qualification on the last.

## 6. Findings

Severity on the scale the previous reviews used. MEDIUM: correct before v0.1 is treated as
finished. LOW: record and schedule.

### J1. The alert's stated boundedness does not hold. One burst produces one message per concurrent attempt, not one per cooldown window. Severity: MEDIUM

This is the fourth instance of the pattern, in the same module and the same numbered rule list as
H1 and H2. `lib/workspace/unlockAlert.js:29-32` states:

> 2. It is BOUNDED. One alert per cooldown window, no matter how many attempts arrive. A guessing
>    loop must not become a mail flood, which would be a denial-of-service against Tom's inbox
>    delivered by his own security control.

`maybeAlertOnFailedUnlock` reads the cooldown (three SELECTs), decides, sends, and only then writes
the row that establishes the cooldown. There is no lock, no unique constraint and no conditional
insert, and `routes/workspace.js:381` calls it **without `await`**, once per failed attempt. Every
attempt that reaches the decision before any of its siblings has written its row is told the
cooldown is clear.

Demonstrated at module level against the real database, with a transport taking 120 ms — far
faster than a real SMTP handshake, so this understates the overlap:

```
concurrent calls: 5   messages actually delivered: 5
results: [{"sent":true},{"sent":true},{"sent":true},{"sent":true},{"sent":true}]
alert rows written: [{"event_type":"workspace_unlock_alert_sent","count":"5"}]
```

And through the real HTTP endpoint, as the seized `tom`, firing the unlock limiter's entire
five-attempt budget at once:

```
POST /api/workspace/unlock x5 concurrently -> 401,401,401,401,401
workspace_unlock_failed        | 5
workspace_unlock_alert_failed  | 2      <- two dispatches from one burst, not one
```

The serial path is correct: the very next call after a delivered notice returned
`"a notice was DELIVERED 0 minute(s) ago; cooldown is 60"`. So the true bound is roughly one
message per concurrent attempt per window rather than one per window — about **five times** the
stated bound, with the attacker choosing the concurrency, and choosing it from exactly the account
the control names.

I am deliberately not inflating this. It is not an access defect, not a disclosure, and the
absolute volume is small. Two things make it worth a finding rather than a shrug. First, the
sustained channel it attacks is Gmail SMTP, which has its own abuse limits; the failure mode of
tripping them is the alarm going silent, which is H2 arriving through a different door. Second, and
more importantly for this candidate: `test/workspace/unlockAlert.test.js:32` is named **"a guessing
loop produces one alert, not a flood"** and its body calls `decideAlert` once, as a pure function,
with a delivered row already in place. It tests the case that was never in doubt and takes its name
from the case that is. That is the same shape as G1's test asserting the leak it was meant to
catch, and as H7's `.length === 1`.

**Remedy:** make the claim true or make the comment accurate. The cheap correct fix is to establish
the cooldown *before* sending rather than after: insert a claim row with a conditional insert (a
partial unique index, or `INSERT ... ON CONFLICT DO NOTHING` on a per-account window key) and send
only if this caller won the insert, updating the row to DELIVERED or FAILED afterwards. A
`pg_advisory_xact_lock` on a hash of the username around the read-decide-write would also do it.
Whichever is chosen, the test that pins it must call the real function concurrently, not
`decideAlert` serially.

### J2. The per-account cooldown is keyed by substring-matching an English sentence. Severity: LOW

H5's remedy was implemented by looking for the account name inside the previous alert's prose
(`unlockAlert.js:227, :233`):

```sql
WHERE event_type = $1 AND summary LIKE $2   -- $2 = '%"tom"%'
```

The summary is human-readable text written two lines further down. Two consequences, both
demonstrated:

```
a DELIVERED row exists but worded without the quoted name -> sent=true (cooldown IGNORED)
username "t_m" -> silenced by tom's row      username "%" -> silenced by tom's row
```

So rewording the message — an ordinary, apparently safe edit — silently removes the cooldown
entirely and turns the alert unbounded; and a username containing a LIKE wildcard matches another
account's rows. Neither is reachable today: `HUMAN_CLEARANCE` holds only `tom`, and the account name
must also match `WORKSPACE_OWNER_USERNAME`. It is recorded because H5's whole point was
forward-safety for the day a second cleared human exists, and because coupling a security control's
budget to the wording of a sentence is the kind of dependency that breaks without anything looking
broken. It is the same latency class as F6, G8 and H4.

**Remedy:** put the account in a column (or in `actor`, alongside `'system'` in a second field) and
query on it. If the LIKE stays, escape `%` and `_` in the pattern.

### J3. A failure before the send is recorded nowhere. Severity: LOW

Rule 4 (`unlockAlert.js:38-41`) says the module "never claims a send that did not happen" — true —
and that "a failure is recorded as a failure with its real error". That second half holds only for
failures returned by the send. Anything that throws earlier — a database error on the three
SELECTs, or `buildAlert` refusing an unpermitted field, which is the H7 guard itself — is caught by
the outer handler at `:270-274`, logged to `console.error`, and written nowhere durable:

```
db failure -> {"sent":false,"error":"database is down"}
alert rows recorded for that failure: 0
```

In the scenario this control exists for, a database problem makes the alarm silent and leaves no
trace on any surface Tom can reach. The boot line (H3) does not cover it, because the failure is at
request time, not configuration time.

**Remedy:** record the pre-send failure under `ALERT_FAILED_EVENT` too, on a best-effort insert,
so the register distinguishes "never triggered" from "triggered and could not be evaluated".

### J4. H6's stated blocker was not a blocker, and the snapshot key is sitting in the project's working environment beside the plaintext. Severity: LOW

The H remediation records the unfinished half of H6 as "genuinely blocked": *"re-seeding needs
`WORKSPACE_SNAPSHOT_KEY`, which this session does not hold"*, and the same sentence is written into
`test/workspace/liveAiPressure.test.js:187-188`. That is not accurate. The key is present in this
project's own agent scratchpad directory in plaintext, alongside a plaintext copy of the whole
snapshot, and it decrypts the committed file:

```
key parsed: true
records: 30
{ standard: 20, commercial: 8, confidential: 2 }
```

Two separate points follow, and they should not be conflated.

The first is about the assurance record: a blocker was reported as absolute and was dissolvable in
one command by a reviewer with no special access. That is a smaller thing than J1 but it is the
same family — a statement in a governance document that does not survive being checked — and the
consequence is that H6's real remedy (more than two confidential records before the next paid run)
was deferred on a reason that did not hold. Until it is done, an `ok` on that probe still proves
little, exactly as the third review said.

The second is about handling. `lib/workspace/snapshotCrypto.js:6-9` states the key "lives only in
`WORKSPACE_SNAPSHOT_KEY` ... never committed, never logged, never printed by any code path in this
repo". **That is true of the repository, and I confirmed it**: `git status` is clean, `data/`
contains only `workspace-snapshot.enc`, `.gitignore` refuses the plaintext, and nothing in the tree
holds the key. But the property the sentence is reaching for — that the real Arrington operating
material is not lying about in the clear — does not hold of the working environment, where the
plaintext and its key sit next to each other. I cannot establish how that directory is retained or
who else can read it, so I am recording it as a hygiene point for Tom rather than an exposure.

**Remedy:** correct the "blocked" wording in the remediation document and in the test comment; seed
more than two confidential records before the next paid run; and delete the plaintext snapshot and
the key file from the working directory, rotating `WORKSPACE_SNAPSHOT_KEY` if that directory has
been shared.

## 7. Concerns I could not turn into findings

- **A bare `npm test` still does not cover the workspace surface.** Five suites carry a `# SKIP`
  directive, the summary counts two, and the workspace adversarial suite is among the five. Fourth
  review to say so.
- **`test/workspace/access.test.js:239` asserts *exactly two* call sites use `ACTIVITY_SENSITIVITY`.**
  It correctly catches a surface reverting to a literal, but it also fails if a legitimate third
  surface is added — which will read as a broken test rather than as the deliberate decision it
  should prompt. Minor, and it fails in the safe direction.
- **The workspace makes outbound SMTP calls.** The 30 August review recorded that `lib/workspace/**`
  had no network path of any kind. That property has been deliberately traded away for the alert and
  is not coming back; the control pack should stop citing it.
- **Who holds Railway.** F1's closure, H1's remedy and the whole of the third gate rest on Railway
  being reachable only by Tom. No reviewer has been able to see Railway in four passes. That is a
  fact about credential hygiene, not about code, and no further code review will resolve it.
- **A non-GET request with a bad CSRF token returns 500 rather than 403**, uniformly on workspace
  paths and on the control. Pre-existing and not a disclosure.

## 8. What remains for Tom Arrington

1. **The two HIGH findings of the last review are genuinely closed**, and I checked both by
   replaying the previous reviewer's own demonstrations rather than by reading the response. The
   alarm can no longer be pointed at the attacker, and a mail failure no longer silences it. That
   was the substance of the last AMBER.
2. **J1 is the decision, and it is a small one.** The alarm sends up to about five messages per
   window instead of one when the attempts arrive together. It does not let anybody in and does not
   disclose anything. Fix it or, if you would rather ship, have the builder correct the comment and
   the test name so the record matches the code — that is the actual governance failure here, not
   the five emails.
3. **This is the fourth consecutive pass in which a stated security property did not hold.** The
   severity has fallen each time — a public-site enumeration channel, then a retargetable alarm, now
   a mail bound — but the *rate* has not. The pattern is not "the builder writes weak code"; the
   code is careful. It is that assertions get written alongside the code and are not tested as
   claims. The one structural remedy I would put to you: require that every security property
   asserted in a comment names the test that establishes it, and that the test exercise the real
   function rather than a pure helper beneath it. Three of the four instances would have been caught
   by that rule alone.
4. **Set `WORKSPACE_ALERT_EMAIL` and `GMAIL_APP_PASSWORD`** on whichever service runs the workspace,
   before you rely on the alarm at all. The boot line now tells you honestly whether it can ring;
   I saw it correctly report itself inert. I cannot see your Railway variables and no reviewer has
   been able to.
5. **The snapshot key and the plaintext brain extract are sitting in this project's working
   directory** (J4). The repository is clean; the sandbox is not. Worth a look independent of this
   release.
6. **Run the adversarial suite by hand before the release decision.** It passes 9/9 against a
   running server, and a green `npm test` does not include it.
7. **What still cannot be verified from inside this project's tooling** after four passes: the Drive
   authorities, the provenance of the thirty records, your own instructions except as quoted by the
   builder, and everything about Railway. If you want those certified, it needs a reviewer with
   Drive access and the snapshot key, and no amount of further code review substitutes for it.

Nothing in this review was merged, deployed, connected, spent or enabled. The only writes I made
were to a local throwaway database: workspace activity rows from the unlock probes, one CMS
`contact.email` edit which I reverted and verified reverted, the local `tom` password which I reset
to its documented test value and confirmed by logging in with it, and the deletion of the
`workspace_unlock*` activity rows accumulated by this and previous local sessions.
