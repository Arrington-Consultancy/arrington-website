#!/usr/bin/env bash
# Weekly copy of the website database into Tom's Google Drive.
#
# What it does, in order:
#   1. turns the Drive refresh token into an access token;
#   2. finds (or creates once) the backup folder in Tom's Drive;
#   3. runs pg_dump over Railway's private network, gzipped, with the
#      session table's rows left out (live login cookies, no value in a
#      backup);
#   4. checks the dump is complete and not trivially small;
#   5. uploads it with Drive's resumable upload and reads the stored size
#      back to confirm it matches;
#   6. deletes backups older than the newest BACKUP_KEEP, touching only
#      files named by this script.
#
# Runs as a Railway cron service from backup/Dockerfile. It exits non-zero
# on any failure so the run shows as failed in Railway. It never prints
# the database URL, the client secret, the refresh token or the access
# token; every log line is safe to read in the deploy log.
#
# Variables (set on the Railway service; every value is trimmed because
# Railway has stored trailing newlines before):
#   DATABASE_URL                 reference to the Postgres service's private URL
#   GOOGLE_DRIVE_CLIENT_ID       OAuth client id (same Google Cloud project as Gmail)
#   GOOGLE_DRIVE_CLIENT_SECRET   its secret
#   GOOGLE_DRIVE_REFRESH_TOKEN   Tom's refresh token with the drive.file scope
#   BACKUP_FOLDER_NAME           optional, default "Arrington website database backups"
#   BACKUP_KEEP                  optional, default 12 (weekly runs, about three months)
#   BACKUP_MIN_BYTES             optional, default 20000; a smaller dump is treated as a failure
# Test hooks (the test suite points them at a local mock; leave unset in production):
#   GOOGLE_OAUTH_TOKEN_URL, GOOGLE_DRIVE_API_BASE
#
# Restore, if it is ever needed: download the file from Drive, then on a
# machine with psql 18:  gunzip -c <file> | psql "$DATABASE_URL"
# against an EMPTY database (the dump creates every table). The session
# table comes back empty, which only means everyone logs in again.

set -euo pipefail

trim() { printf '%s' "$1" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'; }

DB_URL="$(trim "${DATABASE_URL:-}")"
CLIENT_ID="$(trim "${GOOGLE_DRIVE_CLIENT_ID:-}")"
CLIENT_SECRET="$(trim "${GOOGLE_DRIVE_CLIENT_SECRET:-}")"
REFRESH_TOKEN="$(trim "${GOOGLE_DRIVE_REFRESH_TOKEN:-}")"
FOLDER_NAME="$(trim "${BACKUP_FOLDER_NAME:-Arrington website database backups}")"
KEEP="$(trim "${BACKUP_KEEP:-12}")"
MIN_BYTES="$(trim "${BACKUP_MIN_BYTES:-20000}")"
PREFIX="arrington-website-db"
TOKEN_URL="${GOOGLE_OAUTH_TOKEN_URL:-https://oauth2.googleapis.com/token}"
API="${GOOGLE_DRIVE_API_BASE:-https://www.googleapis.com}"

log() { printf 'Backup to Drive: %s\n' "$*"; }
fail() { printf 'Backup to Drive: FAILED: %s\n' "$*" >&2; exit 1; }

for pair in "DATABASE_URL:$DB_URL" "GOOGLE_DRIVE_CLIENT_ID:$CLIENT_ID" \
            "GOOGLE_DRIVE_CLIENT_SECRET:$CLIENT_SECRET" "GOOGLE_DRIVE_REFRESH_TOKEN:$REFRESH_TOKEN"; do
  [ -n "${pair#*:}" ] || fail "${pair%%:*} is not set"
done
case "$KEEP" in ''|*[!0-9]*) fail "BACKUP_KEEP must be a whole number, got '$KEEP'";; esac
[ "$KEEP" -ge 1 ] || fail "BACKUP_KEEP must be at least 1"
case "$MIN_BYTES" in ''|*[!0-9]*) fail "BACKUP_MIN_BYTES must be a whole number";; esac
command -v pg_dump >/dev/null || fail "pg_dump is not installed in this image"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

# 1. Access token. The header goes in a file so the token never appears in
#    a process argument list.
TOKEN_JSON="$(curl -sS -X POST "$TOKEN_URL" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "refresh_token=$REFRESH_TOKEN" \
  --data-urlencode "grant_type=refresh_token" 2>/dev/null || true)"
ACCESS_TOKEN="$(printf '%s' "$TOKEN_JSON" | jq -r '.access_token // empty' 2>/dev/null || true)"
if [ -z "$ACCESS_TOKEN" ]; then
  WHY="$(printf '%s' "$TOKEN_JSON" | jq -r '[.error, .error_description] | map(select(. != null)) | join(": ")' 2>/dev/null || true)"
  fail "Google would not issue an access token${WHY:+ ($WHY)}. Reconnect Drive and set a fresh GOOGLE_DRIVE_REFRESH_TOKEN."
fi
HDR="$WORK/auth.hdr"
printf 'Authorization: Bearer %s\n' "$ACCESS_TOKEN" > "$HDR"
log "access token issued"

drive() { curl -sS -H @"$HDR" "$@"; }
# Google's own reason for a refusal, so a failed run says what to fix. An
# error message carries no credential.
api_error() { printf '%s' "$1" | jq -r '.error.message // empty' 2>/dev/null | head -c 400 || true; }

# 2. The folder. With the drive.file scope the script sees only what it
#    created itself, so the first run creates the folder in Tom's My Drive
#    and every later run finds that same folder.
FOLDER_Q="name = '${FOLDER_NAME//\'/\\\'}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
FOUND="$(drive -G "$API/drive/v3/files" --data-urlencode "q=$FOLDER_Q" \
  --data-urlencode "fields=files(id,name)" --data-urlencode "spaces=drive" || true)"
WHY="$(api_error "$FOUND")"
[ -z "$WHY" ] || fail "Drive refused the folder search ($WHY)"
FOLDER_ID="$(printf '%s' "$FOUND" | jq -r '.files[0].id // empty' 2>/dev/null || true)"
if [ -z "$FOLDER_ID" ]; then
  MADE="$(drive -X POST "$API/drive/v3/files?fields=id" -H 'Content-Type: application/json; charset=UTF-8' \
    --data-binary "$(jq -nc --arg n "$FOLDER_NAME" '{name:$n, mimeType:"application/vnd.google-apps.folder"}')" || true)"
  FOLDER_ID="$(printf '%s' "$MADE" | jq -r '.id // empty' 2>/dev/null || true)"
  WHY="$(api_error "$MADE")"
  [ -n "$FOLDER_ID" ] || fail "could not create the Drive folder '$FOLDER_NAME'${WHY:+ ($WHY)}"
  log "created Drive folder '$FOLDER_NAME' ($FOLDER_ID)"
else
  log "using Drive folder '$FOLDER_NAME' ($FOLDER_ID)"
fi

# 3. The dump.
STAMP="$(date -u +%Y-%m-%d)"
NAME="$PREFIX-$STAMP.sql.gz"
OUT="$WORK/$NAME"
pg_dump "$DB_URL" --no-owner --no-privileges --exclude-table-data=session | gzip -9 > "$OUT"

# 4. Is it a real, complete dump?
gzip -t "$OUT" || fail "the gzip file does not verify"
SIZE="$(stat -c %s "$OUT")"
[ "$SIZE" -ge "$MIN_BYTES" ] || fail "dump is only $SIZE bytes, below BACKUP_MIN_BYTES=$MIN_BYTES"
gunzip -c "$OUT" | tail -n 5 | grep -q 'PostgreSQL database dump complete' || fail "dump does not end with pg_dump's completion line"
TABLES="$(gunzip -c "$OUT" | grep -c '^CREATE TABLE ' || true)"
[ "$TABLES" -ge 10 ] || fail "dump defines only $TABLES tables"
log "dumped $TABLES tables, $SIZE bytes gzipped, session rows excluded"

# 5. Upload (resumable, so size is no concern), then read the stored size back.
META="$(jq -nc --arg n "$NAME" --arg p "$FOLDER_ID" '{name:$n, parents:[$p]}')"
SESSION_URI="$(drive -D - -o /dev/null -X POST "$API/upload/drive/v3/files?uploadType=resumable" \
  -H 'Content-Type: application/json; charset=UTF-8' \
  -H 'X-Upload-Content-Type: application/gzip' \
  -H "X-Upload-Content-Length: $SIZE" \
  --data-binary "$META" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r' | tail -n 1)"
[ -n "$SESSION_URI" ] || fail "Drive did not open an upload session"
PUT_REPLY="$(drive -X PUT "$SESSION_URI" -H 'Content-Type: application/gzip' --data-binary @"$OUT" || true)"
FILE_ID="$(printf '%s' "$PUT_REPLY" | jq -r '.id // empty' 2>/dev/null || true)"
WHY="$(api_error "$PUT_REPLY")"
[ -n "$FILE_ID" ] || fail "upload did not return a file id${WHY:+ ($WHY)}"
STORED="$(drive "$API/drive/v3/files/$FILE_ID?fields=id,name,size" | jq -r '.size // empty')"
[ "$STORED" = "$SIZE" ] || fail "Drive holds $STORED bytes for $NAME but $SIZE were sent"
log "uploaded $NAME ($SIZE bytes) as $FILE_ID"

# 6. Prune. Only files this script named are ever deleted; anything else in
#    the folder is left alone whatever its age.
LIST_Q="'$FOLDER_ID' in parents and name contains '$PREFIX-' and trashed = false"
OLDER="$(drive -G "$API/drive/v3/files" --data-urlencode "q=$LIST_Q" \
  --data-urlencode "orderBy=createdTime desc" --data-urlencode "pageSize=200" \
  --data-urlencode "fields=files(id,name,createdTime)" \
  | jq -r --arg re "^$PREFIX-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.sql\\.gz$" --argjson keep "$KEEP" \
      '[.files[] | select(.name | test($re))] | .[$keep:] | .[] | "\(.id) \(.name)"')"
DELETED=0
if [ -n "$OLDER" ]; then
  while read -r OLD_ID OLD_NAME; do
    [ -n "$OLD_ID" ] || continue
    drive -o /dev/null -w '' -X DELETE "$API/drive/v3/files/$OLD_ID" || fail "could not delete $OLD_NAME"
    DELETED=$((DELETED + 1))
  done <<< "$OLDER"
fi
log "kept the newest $KEEP, deleted $DELETED older backup(s)"
log "done"
