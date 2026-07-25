---
name: goodnight
description: End-of-session "wind down and tuck in" for this project. Ensures two things are true before Tom logs off: (1) the work is committed and pushed to the GitHub remote, and (2) CLAUDE.md (and HANDOVER.md where relevant) reflect the current state of the project. Idempotent and safe to re-run. Never deploys to the live site, never force-pushes, never commits real secrets.
---

# /goodnight — tuck the project in before logging off

Run this at the end of a working session. It makes two things true for the
current project, then prints a short summary. It is idempotent: if something is
already done, confirm it and move on. Do the steps in order.

Read `WORKING-METHOD.md` in the project root if you have not already: it explains
why this skill exists and how it fits the way Tom works.

## 0. Identify the project

The project is the folder you are running in. Resolve its root (call it `$PROJ`):
the nearest ancestor directory containing `CLAUDE.md`, `.git` or `package.json`.
If genuinely ambiguous, ask one short question before doing anything.

Read `$PROJ/CLAUDE.md` (it records the deploy target, repo name and conventions)
and `$PROJ/HANDOVER.md` if present.

## 1. Git: committed and pushed

Goal: `$PROJ` is a git repo with all intended work committed and pushed to its
GitHub remote.

1. **Init if needed.** If there is no `.git`, run `git init -b main`.
2. **Sensible `.gitignore`.** Ensure it ignores at least `node_modules/`, `.env`,
   `*.log`, `.DS_Store` and any project-specific local-only folders that
   `CLAUDE.md` flags as never-commit. Append missing lines, never remove existing
   ones.
3. **Stage, then check for secrets before committing.** Run `git add -A`, then
   scan what is staged:

   ```
   git diff --cached | grep -inE "AIza[0-9A-Za-z_-]{10}|sk-[0-9A-Za-z]{20}|ghp_|xox[baprs]-|-----BEGIN (RSA|OPENSSH|PRIVATE)|(secret|token|password)\s*[:=]\s*['\"][^'\"]{8}"
   ```

   If that finds a real secret (a private key, an API token, a password, a
   database URL with credentials in it): **stop**. Unstage the file, move the
   value into an untracked `.env`, add it to `.gitignore`, tell Tom, and do not
   commit it. Do not "just this once" a secret into git history: removing one
   afterwards is genuinely painful.

   For this project the things to watch for are `SESSION_SECRET`, `DATABASE_URL`
   and the Resend API key. None of them belong in the repo; they live in
   Railway's environment variables.
4. **Commit** with a message that says what changed and why, not just "update".
5. **Push.** `git push` (with `-u origin main` if no upstream is set). If the push
   is rejected, `git pull --rebase` and push again, surfacing any conflicts.
   Never force-push.
6. **Confirm** it landed: `git status -sb` should show in sync with the remote.

**Do not deploy.** Deploying this site to Railway is a separate, explicit
decision that Tom makes. `/goodnight` only touches source control and
documentation, which is exactly why it is safe to run at the end of a messy
session.

Remember that on this site the **page copy and images live in the Postgres
database, not in the repo**. Committing the code does not back up the content,
and editing the content does not change the code. If content changed in a way
worth preserving, say so in the summary and suggest a CMS backup (gear menu →
Backups) instead of pretending git covered it.

## 2. Documentation up to date

1. **`$PROJ/CLAUDE.md`:** make it match reality. Add anything built or changed
   this session, correct any deploy command or file path that has moved, add a
   row to the architecture table for any new source file, and record any incident
   that was diagnosed (what broke, what the symptom was, what fixed it). The
   incident notes are the highest-value lines in the file: they turn hours of
   diagnosis into seconds of reading for the next session.
2. **`$PROJ/HANDOVER.md`:** if the session changed anything about hosting,
   domains, DNS, logins or the database, update it too. It is the operational
   authority.
3. If a decision was made and then not written down anywhere, that is the gap to
   close before finishing.

Keep the house style: UK English, UK dates (DD/MM/YYYY), no em dashes in anything
a visitor might read.

## 3. Report

Print a short summary:

- what was committed, and confirmation it is pushed (with the remote URL);
- which documentation files were updated and what was added;
- anything needing Tom's attention: a secret found and quarantined, a push
  conflict, a change that is committed but **not yet deployed to the live site**,
  or content edits that want a CMS backup.

Then wish him goodnight.

## Guardrails

- **Never commit real secrets.** Quarantine and surface them instead.
- **Never deploy** to the live site from this skill.
- **Never force-push** and never rewrite shared history. Rebase and surface
  conflicts.
- **Idempotent:** safe to run twice. The second run should mostly just confirm.
- If a step cannot be completed safely, do the others, then flag the one that
  could not clearly rather than half-doing it.
