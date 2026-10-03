#!/usr/bin/env bash
# Injects the Arrington "Drive first" rule into every Claude Code session in
# this repository (SessionStart) and a one-line reminder on every message
# (UserPromptSubmit). The harness runs this, not the model, so it does not
# depend on anyone remembering. Prints hook JSON whose additionalContext is
# added to the model's context. Argument: the hook event name.
set -eu
EVENT="${1:-SessionStart}"
if [ "$EVENT" = "SessionStart" ]; then
  CONTEXT='ARRINGTON DRIVE-FIRST RULE (injected by scripts/driveFirstHook.sh, Tom Arrington, 3 October 2026). Before any material Arrington work, read the controlled Google Drive authorities in this order: START HERE. ARRINGTON CONSULTANCY BRAIN INDEX; 00 ARRINGTON BRAND OPERATING SYSTEM; 01 ARRINGTON CURRENT OPERATING POSITION; then the relevant worker START HERE, operating manual and Worker Handoff Log (Website & Hosting for this repository; Google Ads for anything in the Ads account). Your first reply to Tom must quote the title and last-updated date of each document read, the heading and date of the last entry in that Handoff Log, and the next controlled action it names, and must make no live change until Tom has replied. If a document cannot be opened, say which and stop; never work from memory or an earlier chat. Google Ads changes are made as the Google Ads worker and written back to the Google Ads Handoff Log; one session at a time on that account. Full text: WORKER START BLOCK in Drive, and CLAUDE.md, Governance section.'
else
  CONTEXT='Drive-first check: if this message asks for a change to copy, offers, prices, advertising, worker scope or a controlled record, confirm the relevant Drive authority and Worker Handoff Log were read in this session before acting; if not, read them first and say so.'
fi
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":%s}}\n' "$EVENT" "$(printf '%s' "$CONTEXT" | jq -Rs .)"
